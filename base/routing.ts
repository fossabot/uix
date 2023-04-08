// deno-lint-ignore-file no-namespace

import { Path } from "unyt_node/path.ts";
import { Logger } from "unyt_core/datex_all.ts";
import { resolveEntrypointRoute, Entrypoint, html_content_or_generator, provideError, RenderMethod, RoutingHandler, refetchRoute } from "../html/rendering.ts";
import { HTMLUtils } from "../html/utils.ts";

/**
 * Generalized implementation for setting the route in the current tab URL
 * Used in combination with components
 * You should only use the Routing.update() method in most cases to update the current URL, and otherwise rely on the component specific routing implementation (resolveRoute, handleRoute, getInternalRoute)
 */

const logger = new Logger("UIX Routing");

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

	export function setCurrentRoute<S extends boolean>(url?:string|URL, silent?: S): S extends true ? boolean : Promise<void>
	export function setCurrentRoute<S extends boolean>(parts?:string[], silent?: S): S extends true ? boolean : Promise<void>
	export function setCurrentRoute(_route?:string|string[]|URL, silent = false) {
		if (!globalThis.history) return false;
		const route = Path.Route(_route);
		if (Path.routesAreEqual(getCurrentRouteFromURL(), route)) return false; // no change, ignore

		history.pushState(null, "", route.routename);
	
		if (!silent) return handleCurrentURLRoute();
		else return true;
	}


	export async function setEntrypoints(frontend?: Entrypoint, backend?: Entrypoint) {
		frontend_entrypoint = frontend;
		backend_entrypoint = backend;
		const backend_available = backend_entrypoint ? await initEndpointContent(backend_entrypoint) : false;
		const frontend_available = frontend_entrypoint ? await initEndpointContent(frontend_entrypoint) : false;
		// no content for path found after initial loading
		if (!frontend_available && !backend_available) {
			document.body.innerHTML = await (await provideError("No content for this path")).text();
		}
	}

	async function initEndpointContent(entrypoint:Entrypoint) {
		const content = await getContentFromEntrypoint(entrypoint)
		if (content != null) await setContent(content, entrypoint)
		return content != null
	}

	async function getContentFromEntrypoint(entrypoint: Entrypoint, route: Path.Route = getCurrentRouteFromURL()) {
		const [collapsed_content, _render_method] = <[html_content_or_generator, RenderMethod]><any> await resolveEntrypointRoute(entrypoint, route, undefined, false);
		return collapsed_content;
	}

	async function setContent(content: html_content_or_generator, entrypoint:Entrypoint) {
		current_entrypoint = entrypoint;
		if (current_content !== content) {
			current_content = content;
			document.body.innerHTML = "";
			// console.log("-->",collapsed_content)
			// TODO: 
			if (typeof content == "object" && !(content instanceof HTMLElement)) console.warn("invalid content, cannot handle yet", content)
			HTMLUtils.append(document.body, content) // add to document
		}
	
		await update(getCurrentRouteFromURL(), false)
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
				if (allowReload) window.location.reload()
				return false
			}
			return true;
			// TODO: what to do with returned content (full entrypoint route not known)
		}

		// still nothing found - route could not be fully resolved on frontend, try to reload from backend
		if (content == null) {
			logger.warn `no content for ${getCurrentRouteFromURL().routename}, reloading page from backend`; 
			if (allowReload) window.location.reload()
			return false;
		}

		await setContent(content, entrypoint!);
		return true;
	}

	function getInferredDOMEntrypoint(){
		return document.body.children[0] instanceof HTMLElement ? document.body.children[0] : null
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

			const refetched_route = await refetchRoute(route, entrypoint);// Path.Route(await (<RoutingHandler>current_content).getInternalRoute());

			// check of accepted route matches new calculated current_route
			if (route_should_equal && !Path.routesAreEqual(route_should_equal, refetched_route)) {
				logger.warn `new route should be "${Path.Route(route_should_equal).routename}", but was changed to "${refetched_route.routename}". Make sure getInternalRoute() and onRoute() are consistent in all components.`;
				// stop ongoing loading animation
				window.stop()
				// something is wrong, content was server side rendered, routes might not be resolved correctly, better reload to get server routing
				if (usingInferredEntrypoint) window.location.href = Path.Route(route_should_equal).routename; 
			}

			// must be updated to new
			if (!Path.routesAreEqual(current, refetched_route)) {
				changed = setCurrentRoute(refetched_route, true); // update silently
			}
		}

		if (changed) logger.success `new route: ${getCurrentRouteFromURL().routename??"/"}`;

	}


	// listen for history changes

	// @ts-ignore
	if (globalThis.navigation) {
		// @ts-ignore
		globalThis.navigation?.addEventListener("navigate", (e:any)=>{
			if (!e.userInitiated || !e.canIntercept || e.downloadRequest || e.formData) return;
			const url = new URL(e.destination.url);
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