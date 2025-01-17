import { Datex } from "datex-core-legacy";
import { Context } from "../routing/context.ts";
import { Path } from "../utils/path.ts";
import { HTTPStatus } from "./http-status.ts";
import { RenderPreset, RenderMethod } from "../base/render-methods.ts";
import { KEEP_CONTENT } from "./entrypoint-providers.tsx";
import { resolveEntrypointRoute } from "../routing/rendering.ts";
import { filter } from "../routing/route-filter.ts";
import { Element } from "../uix-dom/dom/mod.ts";


export type raw_content = Blob|Response // sent as raw Response
export type special_content = URL|Deno.FsFile|HTTPStatus|Error // gets converted to a Response
export type html_content = Datex.RefOrValue<Element|string|number|boolean|bigint|Datex.Markdown|RouteManager|RouteHandler>|null|undefined|raw_content|special_content;
export type html_content_or_generator<
	SharedData extends Record<string, unknown> = Record<string, unknown>,
	PrivateData extends Record<string, unknown> = Record<string, unknown>
	> = html_content|html_generator<SharedData, PrivateData>;
export type html_content_or_generator_or_preset<
	SharedData extends Record<string, unknown> = Record<string, unknown>,
	PrivateData extends Record<string, unknown> = Record<string, unknown>
	> = html_content_or_generator<SharedData, PrivateData>|RenderPreset<RenderMethod, html_content_or_generator<SharedData, PrivateData>>;

export type EntrypointRouteMap<
	SharedData extends Record<string, unknown> = Record<string, unknown>,
	PrivateData extends Record<string, unknown> = Record<string, unknown>
	> = {[route:string|filter]:Entrypoint<SharedData, PrivateData>}
export type html_generator<
	SharedData extends Record<string, unknown> = Record<string, unknown>,
	PrivateData extends Record<string, unknown> = Record<string, unknown>
	> = (ctx:Context<SharedData, PrivateData>, params:Record<string, string>)=>Entrypoint<SharedData, PrivateData> // html_content|RenderPreset<RenderMethod, html_content>|Promise<html_content|RenderPreset<RenderMethod, html_content>>;

type _Entrypoint<
	SharedData extends Record<string, unknown> = Record<string, unknown>,
	PrivateData extends Record<string, unknown> = Record<string, unknown>
	> = html_content_or_generator_or_preset<SharedData, PrivateData> | EntrypointRouteMap<SharedData, PrivateData> | typeof KEEP_CONTENT

/**
 * UIX Entrypoint type.
 * Default exports in entrypoint.ts/entrypoint.tsx must satisfy this type:
 * ```ts
 * export default "Hello World" satisfies Entrypoint;
 * ```
 * ```ts
 * export default <h1>Title</h1> satisfies Entrypoint;
 * ```
 * ```ts
 * export default {
 *   '/route1': 'Hello',
 *   '/route2': 'World'
 * } satisfies Entrypoint;
 * ```
 */
export type Entrypoint<
	SharedData extends Record<string, unknown> = Record<string, unknown>,
	PrivateData extends Record<string, unknown> = Record<string, unknown>
	> = _Entrypoint<SharedData, PrivateData> | Promise<_Entrypoint<SharedData, PrivateData>>


/**
 * handles routes internally
 */
export interface RouteManager {
	resolveRoute(route:Path.Route, context:Context): Path.route_representation|Promise<Path.route_representation> // return part of route that could be resolved
	getInternalRoute(): Path.route_representation|Promise<Path.route_representation> // return internal state of last resolved route
}

/**
 * redirects to other Entrypoints for specific routes
 */
export interface RouteHandler {
	getRoute(route:Path.Route, context:Context): Entrypoint|Promise<Entrypoint> // return child entrypoint for route
}



/**
 * transforms entrypoint content to a new entrypoint content
 */
export abstract class EntrypointProxy<E extends Entrypoint = Entrypoint> implements RouteHandler {

	#entrypoint: E
	get entrypoint() {return this.#entrypoint}

	constructor(entrypoint: E = null as E) {
		this.#entrypoint = entrypoint;
	}

	async getRoute(route:Path.Route, context: Context) {
		let entrypoint = this.#entrypoint;
		route = Path.Route(await this.redirect?.(route, context) ?? route);
		const intercepted = await this.intercept?.(route, context);
		if (intercepted != null) entrypoint = intercepted as E;
		const {content, render_method} = await resolveEntrypointRoute({entrypoint, route, context});
		return this.transform?.(content, render_method, route, context) ?? <any> new RenderPreset<RenderMethod, html_content_or_generator>(render_method, content);
	}

	/**
	 * This method is called before intercept()
	 * It can be used to modify the route that is used by the intercept method and the entrypoint
	 * 
	 * The returned value replaces the current route part
	 * 
	 * @param route requested route
	 * @param context UIX context
	 * @returns new route or void
	 */
	abstract redirect?(route:Path.Route, context: Context): void|Path.route_representation|string|null|Promise<void|Path.route_representation|string|null>

	/**
	 * This method is called before a route is resolved by the entrypoint
	 * It can be used to implement a custom routing behaviour
	 * for some or all routes, overriding the entrypoint routing
	 * 
	 * The returned value replaces the entrypoint, if not null
	 * 
	 * @param route requested route
	 * @param context UIX context
	 * @returns entrypoint override or null
	 */
	abstract intercept?(route:Path.Route, context: Context): void|Entrypoint|Promise<void|Entrypoint>

	/**
	 * This method is called after a route was resolved by the entrypoint
	 * It can be used to override the content provided for a route by returning 
	 * a different entrypoint value. 
	 * When null is returned, the route content is not changed
	 * 
	 * @param content content as resolved by entrypoint
	 * @param render_method render method as resolved by entrypoint
	 * @param route the requested route
	 * @param context UIX context
	 * @returns entrypoint override or null
	 */
	abstract transform?(content: Entrypoint, render_method: RenderMethod, route:Path.Route, context: Context): void|Entrypoint|Promise<void|Entrypoint>
}

