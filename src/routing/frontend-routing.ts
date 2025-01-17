// deno-lint-ignore-file no-namespace

import { Path } from "../utils/path.ts";
import { resolveEntrypointRoute,  refetchRoute } from "./rendering.ts";
import { Datex } from "datex-core-legacy";
import { Entrypoint, html_content_or_generator } from "../html/entrypoints.ts";
import { KEEP_CONTENT } from "../html/entrypoint-providers.tsx";
import { displayError } from "../html/errors.tsx";
import { domUtils } from "../app/dom-context.ts";
import { PartialHydration } from "../hydration/partial-hydration.ts";
import { Context } from "./context.ts";

/**
 * Generalized implementation for setting the route in the current tab URL
 * Used in combination with components
 * You should only use the Routing.update() method in most cases to update the current URL, and otherwise rely on the component specific routing implementation (resolveRoute, handleRoute, getInternalRoute)
 */

const logger = new Datex.Logger("UIX Routing");

export namespace Routing {

	let frontend_entrypoint: Entrypoint|undefined
	let backend_entrypoint: Entrypoint|undefined
	let current_entrypoint: Entrypoint|undefined
	let current_content: any;

	// @deprecated
	export const Prefix = {};
	export function setPrefix(){}

	export function getCurrentRouteFromURL() {
		return Path.Route(window.location.href ?? import.meta.url);
	}

	export function setCurrentRoute<S extends boolean>(url?:string|URL, silent?: S): S extends true ? boolean : Promise<boolean>
	export function setCurrentRoute<S extends boolean>(parts?:string[], silent?: S): S extends true ? boolean : Promise<boolean>
	export function setCurrentRoute(_route?:string|string[]|URL, silent = false) {
		if (!globalThis.history) return false;
		const route = Path.Route(_route);
		if (Path.routesAreEqual(getCurrentRouteFromURL(), route)) return false; // no change, ignore

		history.pushState(null, "", route.routename);
	
		if (!silent) return handleCurrentURLRoute();
		else return true;
	}


	export async function setEntrypoints(frontend?: Entrypoint, backend?: Entrypoint, isHydrating = false) {
		frontend_entrypoint = frontend;
		backend_entrypoint = backend;
		// entrypoints available - enable frontend routing
		if (frontend_entrypoint || backend_entrypoint) {
			enableFrontendRouting();
		}

		if (isHydrating) return; // no init required when hydrating

		const backend_available = backend_entrypoint ? await renderEntrypoint(backend_entrypoint) : false;
		const frontend_available = (!backend_available &&  frontend_entrypoint) ? await renderEntrypoint(frontend_entrypoint) : false;

		// no content for path found after initial loading
		if (!frontend_available && !backend_available) {
			displayError("No content", `Route resolved to null on the ${backend_entrypoint?'backend':''}${(backend_entrypoint&&frontend_entrypoint?' and ': '')}${frontend_entrypoint?'frontend':''}`)
		}
	}

	export async function renderEntrypoint(entrypoint:Entrypoint) {
		const content = await getContentFromEntrypoint(entrypoint, undefined)
		if (content != null && content !== KEEP_CONTENT) await setContent(content, entrypoint)
		return content != null
	}


	async function getContentFromEntrypoint(entrypoint: Entrypoint, route: Path.Route = getCurrentRouteFromURL()) {
		const { content } = await resolveEntrypointRoute({entrypoint, route});
		return content;
	}

	async function setContent(content: html_content_or_generator, entrypoint:Entrypoint) {
		current_entrypoint = entrypoint;

		if (current_content !== content) {
			current_content = content;
			// TODO:
			if (content == null) return;

			// partial hydration, no need to set new dom nodes 
			else if (content instanceof PartialHydration) {
				return;
			}

			else if (content instanceof Array) {
				document.body.innerHTML = "";
				domUtils.append(document.body, content) // add to document
			}
			// handle response
			else if (content instanceof Response) {
				renderResponse(content)
			}

			// TODO: currently only displayed if type not correctly mapped (TypedValue fallback)
			else if (!(content instanceof Datex.TypedValue)) { //if (content instanceof Element || content instanceof DocumentFragment) {
				document.body.innerHTML = "";
				// TODO: handle all content correctly (same behaviour as on backend)
				domUtils.append(document.body, content) // add to document
			}
			else {
				displayError("UIX Rendering Error", "Cannot render value of type " + Datex.Type.ofValue(content));
			}
			// else {
			// 	logger.error("invalid content, cannot handle yet", content)
			// 	return;
			// }
		}
	
		await update(getCurrentRouteFromURL(), false)
	}

	/**
	 * Render a Response on the client side
	 * @param response 
	 */
	async function renderResponse(response: Response) {
		if (response.body instanceof ReadableStream) {
			if (isContentType(response, "text/html")) {
				document.body.innerHTML = await response.text();
			}
			else if (isContentType(response, "text/plain")) {
				const content = await response.text()
				document.body.innerHTML = '<pre style="all:initial;word-wrap: break-word; white-space: pre-wrap;">'+domUtils.escapeHtml(content)+'</pre>'
			}
			else {
				displayError("UIX Rendering Error", "Cannot render value with mime type \""+response.headers.get("content-type")+"\" on frontend");
			}
		}
		else if (response.status === 302) {
			window.location.href = response.headers.get("location")!;
		}
		else if (response.body) {
			console.warn("cannot handle response body on frontend (TODO)", response)
		}
		else {
			console.warn("cannot handle response on frontend (TODO)", response)
		}
	}

	function isContentType(response: Response, mimeType: `${string}/${string}`) {
		const actualMimeType = response.headers.get("content-type") 
		return actualMimeType === mimeType || actualMimeType?.startsWith(mimeType + ";")
	}


	async function handleCurrentURLRoute(allowReload=true){
		let content:any;
		let entrypoint:Entrypoint|undefined;

		// try frontend entrypoint
		if (frontend_entrypoint) {
			content = await getContentFromEntrypoint(frontend_entrypoint)
			entrypoint = frontend_entrypoint;
		}

		// try backend entrypoint
		if (content == null && backend_entrypoint) {
			content = await getContentFromEntrypoint(backend_entrypoint);
			entrypoint = backend_entrypoint;
		}
		if (!frontend_entrypoint && !backend_entrypoint) {
			const inferred_entrypoint = getInferredDOMEntrypoint();
			const _content = await getContentFromEntrypoint(inferred_entrypoint);
			const refetched_route = await refetchRoute(getCurrentRouteFromURL(), inferred_entrypoint);
			
			// check of accepted route matches new calculated current_route
			if (!Path.routesAreEqual(getCurrentRouteFromURL(), refetched_route)) {
				logger.warn `invalid route from inferred frontend entrypoint, reloading page from backend`; 
				if (allowReload) window?.location?.reload?.()
				return false
			}
			// window.location.reload()
			return true;
			// TODO: what to do with returned content (full entrypoint route not known)
		}

		// still nothing found - route could not be fully resolved on frontend, try to reload from backend
		if (content == null) {
			logger.warn `no content for ${getCurrentRouteFromURL().routename}, reloading page from backend`; 
			if (allowReload) window?.location?.reload?.()
			return false;
		}

		await setContent(content, entrypoint!);
		return true;
	}

	function getInferredDOMEntrypoint(){
		return document.body.children[0] instanceof Element ? document.body.children[0] : null
	}

	const INITIAL_LOAD = Symbol("INITIAL_LOAD")

	/**
	 * updates the current URL with the current route requested from the get_handler
	 */
	export async function update(route_should_equal?:Path.route_representation, load_current_new = false){

		const current = getCurrentRouteFromURL();
		const route = route_should_equal ?? current;

		// first load current route
		if (load_current_new) await handleCurrentURLRoute();

		let changed = !!route_should_equal;

		const usingInferredEntrypoint = !current_entrypoint; // reconstructing entrypoint from DOM. Probable reason: content was server side rendered
		const entrypoint = current_entrypoint ?? getInferredDOMEntrypoint();

		if (entrypoint) {
			// entrypoint was inferred but inferred entrypoint was not yet initially routed
			if (usingInferredEntrypoint) {
				const loadedInitial = entrypoint[INITIAL_LOAD];
				entrypoint[INITIAL_LOAD] = true;
				if (!loadedInitial) await handleCurrentURLRoute();
			} 

			// TODO: use route refetching?
			// const refetched_route = await refetchRoute(route, entrypoint);// Path.Route(await (<RouteManager>current_content).getInternalRoute());
			// // check if accepted route matches new calculated current_route
			// if (route_should_equal && !Path.routesAreEqual(route_should_equal, refetched_route)) {
			// 	logger.warn `new route should be "${Path.Route(route_should_equal).routename}", but was changed to "${refetched_route.routename}". Make sure getInternalRoute() and onRoute() are consistent in all components.`;
			// 	// stop ongoing loading animation
			// 	window.stop()
			// 	// something is wrong, content was server side rendered, routes might not be resolved correctly, better reload to get server routing
			// 	if (usingInferredEntrypoint) window.location.href = Path.Route(route_should_equal).routename; 
			// }

			// // must be updated to new
			// if (!Path.routesAreEqual(current, refetched_route)) {
			// 	changed = setCurrentRoute(refetched_route, true); // update silently
			// }
		}

		if (changed) logger.success `new route: ${getCurrentRouteFromURL().routename??"/"}`;

	}

	let frontendRoutingEnabled = false;

	function enableFrontendRouting() {
		if (frontendRoutingEnabled) return;
		frontendRoutingEnabled = true;
		logger.debug("frontend routing enabled");

		// listen for history changes

		// @ts-ignore
		if (globalThis.navigation) {
			// @ts-ignore
			globalThis.navigation?.addEventListener("navigate", (e:any)=>{
				
				if (!e.userInitiated || !e.canIntercept || e.downloadRequest || e.formData) return;
				
				const url = new URL(e.destination.url);
				// pass links to /@uix/...
				if (url.pathname.startsWith("/@uix/")) return;

				if (url.origin != new URL(window.location.href).origin) return;

				// TODO: this intercept should be cancelled/not executed when the route is loaded from the server (determined in handleCurrentURLRoute)
				e.intercept({
					async handler() {
						await handleCurrentURLRoute();
					},
					focusReset: 'manual',
					scroll: 'manual'
				})
				e.s
			})
		}

		// fallback if "navigate" event not supported - only works for # paths, otherwise, page is reloaded
		else {
			globalThis.addEventListener('popstate', (e) => {
				handleCurrentURLRoute();
			})
		}
	}

}