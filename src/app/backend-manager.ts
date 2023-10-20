import { ALLOWED_ENTRYPOINT_FILE_NAMES } from "./app.ts";
import { Path } from "../utils/path.ts";
import { getExistingFileExclusive } from "../utils/file-utils.ts";
import { resolveEntrypointRoute } from "../routing/rendering.ts";
import { logger } from "../utils/global-values.ts";
import { PageProvider } from "../html/entrypoint-providers.tsx";
import { RenderMethod, RenderPreset } from "../base/render-methods.ts";
import { Entrypoint } from "../html/entrypoints.ts";
import type { normalizedAppOptions } from "./options.ts";
import { createBackendEntrypointProxy } from "../routing/backend-entrypoint-proxy.ts";

/**
 * Manages a backend endpoint deno instance
 */
export class BackendManager {
	
	srcPrefix = "/@uix/src/"

	#scope: Path.File
	#basePath: Path.File
	#web_path: Path
	#entrypoint?: Path.File
	#web_entrypoint?: Path
	#pagesDir?: Path.File
	virtualEntrypointContent?: string;
	#watch: boolean

	get watch() {return this.#watch}

	#module?: Record<string,any>
	#content_provider?: Entrypoint

	get entrypoint() {
		return this.#entrypoint;
	}

	get scope() {return this.#scope}

	get web_entrypoint() {
		// don't use web entrypoint if static rendering for default content
		if (this.#content_provider instanceof RenderPreset && (this.#content_provider.__render_method == RenderMethod.BACKEND || this.#content_provider.__render_method == RenderMethod.STATIC)) return undefined;
		return this.#web_entrypoint
	}
	get module() {return this.#module}
	get content_provider() {return this.#content_provider}

	#entrypointProxy?: Function;
	get entrypointProxy() {
		if (!this.#entrypointProxy) this.#entrypointProxy = createBackendEntrypointProxy(this.content_provider);
		return this.#entrypointProxy;
	}

	constructor(appOptions:normalizedAppOptions, scope:Path.File, basePath:URL, watch = false){
		this.#scope = scope;
		this.#basePath = Path.File(basePath);
		this.#watch = watch;

		this.#web_path = new Path(`uix://${this.srcPrefix}${this.#scope.name}/`);
		try {
			const entrypoint_path = getExistingFileExclusive(this.#scope, ...ALLOWED_ENTRYPOINT_FILE_NAMES);

			if (entrypoint_path) {
				this.#entrypoint = new Path(entrypoint_path);
				this.#web_entrypoint = this.#web_path.getChildPath(this.#entrypoint.name).replaceFileExtension("dx", "dx.ts");
			}
			// no entrypoint, but pages directory mapping
			else if (appOptions.pages) {
				this.#pagesDir = appOptions.pages;
				this.virtualEntrypointContent = "console.warn('PageProvider cannot yet be properly mapped from the backend'); export default {};"; // TODO UIX.PageProvider
				this.#web_entrypoint = this.#web_path.getChildPath("entrypoint.ts"); // virtual entrypoint, has no corresponding file in backend dir
			}

		}
		catch {
			logger.error("Only one of the following entrypoint files can exists in a directory: " + ALLOWED_ENTRYPOINT_FILE_NAMES.join(", "));
			throw "ambiguous entrypoint"
		}

		if (this.#watch) this.watchFiles();
	
	}

	async watchFiles(){
		for await (const event of Deno.watchFs(this.#scope.normal_pathname, {recursive: true})) {
			this.restart()
		}
	}

	restart() {
		logger.info("restarting backend...");
		Deno.exit(42)
	}

	/**
	 * start entrypoint if it exists
	 * @returns default export if it exists
	 */
	async run() {
		if (this.#entrypoint) {
			const module = this.#module = <any> await datex.get(this.#entrypoint);
			this.#content_provider = module.default ?? (Object.getPrototypeOf(module) !== null ? module : null);
			// default ts export, or just the result if DX and not ts module
			await resolveEntrypointRoute({entrypoint: this.#content_provider}); // load fully
			return this.#content_provider;
		}
		else if (this.#pagesDir) {
			logger.debug(`Using ${this.#pagesDir} as pages for backend entrypoint`)
			this.#content_provider = new PageProvider(this.#pagesDir);
			// default ts export, or just the result if DX and not ts module
			await resolveEntrypointRoute({entrypoint: this.#content_provider}); // load fully
			return this.#content_provider;
		}
		return null;
	}

}