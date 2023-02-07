import { Datex } from "unyt_core";
import { context_kind, context_meta_getter, context_meta_setter, context_name, handleDecoratorArgs, METADATA } from "unyt_core/datex_all.ts";
import { Types } from "../utils/global_types.ts";
import { abstract_component_classes, component_classes, component_groups, logger } from "../utils/global_values.ts";
import { getCloneKeys } from "../utils/utils.ts";
import { Components} from "../components/main.ts";
import { Elements} from "../elements/main.ts";
import { Files } from "./files.ts";
import { window } from "../utils/constants.ts";


//export const customElements = <typeof globalThis.customElements> globalThis.customElements ? globalThis.customElements : {define:()=>null};

/** @Element for elements without component state */
export function Element<C>(target: Function & { prototype: C }):any
export function Element<C>(...args:any[]) {
	return handleDecoratorArgs(args, _Element);
}

function _Element(element_class:typeof Elements.Base, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[string]|[string, Components.Base.Options]|[Components.Base.Options?] = []) {
	if (kind != "class") {
		logger.error("@UIX.Element has to be used on a class");
		return;
	}

	const formatted_name = "uix-"  + String(name).split(/([A-Z][a-z]+)/).filter(t=>!!t).map(t=>t.toLowerCase()).join("-"); // convert from CamelCase to snake-case
	window.customElements.define(formatted_name, element_class)
}

/**
 * @Component decorators for custom new elements and default elements
 */
export function Component<T extends Components.Base.Options> (default_options:Partial<Datex.DatexObjectInit<T>>, initial_constraints:Partial<Datex.DatexObjectInit<Types.component_constraints>>):any
export function Component<T extends Components.Base.Options> (default_options:Partial<Datex.DatexObjectInit<T>>):any
export function Component():any
export function Component<C>(target: Function & { prototype: C }):any
export function Component<C>(...args:any[]):any {
	return handleDecoratorArgs(args, _Component);
}


function _Component(component_class:Types.ComponentSubClass, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[Components.Base.Options?, Types.component_constraints?] = []) {

	const url = new Error().stack?.trim()?.match(/((?:https?|file)\:\/\/.*?)(?::\d+)*(?:$|\nevaluate@)/)?.[1];
	if (!url) throw new Error("Could not get the location of a UIX component. This should not happen");

	if (component_class.prototype instanceof Components.Base) {

		// set auto module (url from stack trace), not if module === null => resources was disabled with @NoResources
		if (url && component_class._module !== null) component_class._module = url;
		// default value of _use_resources is true (independent of parent class), if it was not overriden for this Component with @NoResources
		if (!Object.hasOwn(component_class, '_use_resources')) component_class._use_resources = true;

		// preload css files
		component_class.preloadStylesheets();

		const name = String(component_class.name).split(/([A-Z][a-z]+)/).filter(t=>!!t).map(t=>t.toLowerCase()).join("-"); // convert from CamelCase to snake-case

		const datex_type = Datex.Type.get("uix", name.replaceAll("-",""));
		const options_datex_type = Datex.Type.get("uixopt", name.replaceAll("-",""));

		// create template class for component
		const new_class = <Types.ComponentSubClass>Datex.createTemplateClass(component_class, datex_type, true);

		// add custom serialization
		//updateJSInterfaceConfiguration(datex_type, "serialize", (value:Components.Base)=>value.stored_datex_state);

		// component default options

		new_class.DEFAULT_OPTIONS = Object.create(Object.getPrototypeOf(new_class).DEFAULT_OPTIONS ?? Components.Base.DEFAULT_OPTIONS);
		if (params[0]) {
			// ! title is overriden, even if a parent class has specified another default title
			if (!(<Components.Base.Options>params[0]).title)(<Components.Base.Options>params[0]).title = component_class.name;
			Object.assign(new_class.DEFAULT_OPTIONS, params[0])
		}

		// find non-primitive values in default options (must be copied)
		new_class.CLONE_OPTION_KEYS = getCloneKeys(new_class.DEFAULT_OPTIONS);

		// initial constraints
		if (Object.getPrototypeOf(new_class).INITIAL_CONSTRAINTS) new_class.INITIAL_CONSTRAINTS = {...Object.getPrototypeOf(new_class).INITIAL_CONSTRAINTS};
		if (params[1]) {
			if (!new_class.INITIAL_CONSTRAINTS) new_class.INITIAL_CONSTRAINTS = {}
			Object.assign(new_class.INITIAL_CONSTRAINTS, params[1]);
		}


		component_classes.set(datex_type, new_class);


		// create DATEX type for options (with prototype)
		options_datex_type.setJSInterface({
			prototype: new_class.DEFAULT_OPTIONS,

			proxify_children: true,
			is_normal_object: true,
		})

		// define custom DOM element after everything is initialized
		window.customElements.define("uix-"+name, component_class)
		
		return new_class //element_class
	}
	else throw new Error("Invalid @UIX.Component - class must extend Components.Base")
}

/**
 * @NoResources: disable external resource loading (.css, .dx), must be located below the @Component decorator
 */
export function NoResources<C>(target: Function & { prototype: C }):any
export function NoResources(...args:any[]):any {
	return handleDecoratorArgs(args, _NoResources);
}

function _NoResources(component_class:Types.ComponentSubClass, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter) {
	// was called after @Component
	if (Object.hasOwn(component_class, '_module')) {
		throw new Error("Please put the @NoResources decorator for the component '"+name+"' below the @Component decorator");
	}
	component_class._use_resources = false;
}



export const ID_PROPS: unique symbol = Symbol("ID_PROPS");
export const CONTENT_PROPS: unique symbol = Symbol("CONTENT_PROPS");
export const IMPORT_PROPS: unique symbol = Symbol("IMPORT_PROPS");

/** @id to automatically assign a element id to a component property */
export function id(id?:string):any
export function id(target: any, name?: string, method?:any):any
export function id(...args:any[]) {
	return handleDecoratorArgs(args, _id);
}

function _id(element_class:typeof Elements.Base, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[string?] = []) {
	if (kind != "field") {
		logger.error("@UIX.id has to be used on a field");
		return;
	}

	setMetadata(ID_PROPS, params[0]??name);
}

/** @content to automatically assign a element id to a component property and add element to component content */
export function content(id?:string):any
export function content(target: any, name?: string, method?:any):any
export function content(...args:any[]) {
	return handleDecoratorArgs(args, _content);
}

function _content(element_class:typeof Elements.Base, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[string?] = []) {
	if (kind != "field") {
		logger.error("@UIX.content has to be used on a field");
		return;
	}

	setMetadata(CONTENT_PROPS, params[0]??name);
}


/** @UIX.use to bind static properties */
export function use(resource?:string, export_name?:string):any
export function use(target: any, name?: string, method?:any):any
export function use(...args:any[]) {
	return handleDecoratorArgs(args, _use);
}

function _use(element_class:typeof Elements.Base, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[string?, string?] = []) {

	if (kind != "field" && kind != "method") {
		logger.error("@UIX.use has to be used on a field or method");
		return;
	}

	setMetadata(IMPORT_PROPS, [params[0], params[1]??name]);
}



/**
 * @UIX.Id unique component id
 */
export function Id<C>(id:string) {
	return (target: Function & { prototype: C }) => {
	}
}

// /**
//  * @UIX.App app definition
//  */
// export function App<C>(...args:any[]) {
// 	return handleDecoratorArgs(args, _App);
// }
// function _App(app_class:Types.ComponentSubClass, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[options?:any] = []) {
// 	return app_class
// }


/**
 * @UIX.Section for app definition
 */
export function Section<C>(...args:any[]) {
	return handleDecoratorArgs(args, _Section);
}
function _Section(app_class:Types.ComponentSubClass, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[options?:any] = []) {
	return app_class
}

/**
 * @UIX.Group component group
 */
export function Group<C>(group_name:string) {
	return (target: Function & { prototype: C }) => {
		if (!component_groups.has(group_name)) component_groups.set(group_name, new Set());
		component_groups.get(group_name).add(<Types.ComponentSubClass>target);
	}
}

/**
 * @UIX.Abstract decorators for custom new elements and default elements
 */
export function Abstract<C>(target: Function & { prototype: C }) {
	abstract_component_classes.add(<Types.ComponentSubClass>target);
}

/**
 * @UIX.Files decorators for file editors (important !! add decorator after (left to) UIX.Component)
 */
export function BindFiles<C>(files:Files.files) {
	return (target: Function & { prototype: C }) => {
		Files.registerFileHandlerElement(files, <Types.ComponentSubClass>target);
	}
}