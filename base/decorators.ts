import { Datex } from "unyt_core";
import { Class, context_kind, context_meta_getter, context_meta_setter, context_name, handleDecoratorArgs, METADATA } from "unyt_core/datex_all.ts";
import { Types } from "../utils/global_types.ts";
import { abstract_component_classes, component_classes, component_groups, logger } from "../utils/global_values.ts";
import { getCloneKeys } from "../utils/utils.ts";
import { Components} from "../components/main.ts";
import { Elements} from "../elements/main.ts";
import { Files } from "./files.ts";
import "../html/datex_binding.ts";
import { UIXComponent } from "../components/UIXComponent.ts";
import { getCallerFile } from "unyt_core/utils/caller_metadata.ts";

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
 * @deprecated use @UIX.defaultOptions (todo)
 */
export function Component<T extends Components.Base.Options|UIXComponent.Options> (default_options:Partial<Datex.DatexObjectPartialInit<T>>, initial_constraints:Partial<Datex.DatexObjectPartialInit<Types.component_constraints>>):any
export function Component<T extends Components.Base.Options|UIXComponent.Options> (default_options:Partial<Datex.DatexObjectPartialInit<T>>):any
export function Component():any
export function Component<C>(target: Function & { prototype: C }):any
export function Component<C>(...args:any[]):any {
	const url = getCallerFile(); // TODO: called even if _init_module set
	return handleDecoratorArgs(args, (...args)=>_Component(url, ...args));
}

// use instead of @UIX.Component
export const defaultOptions = Component;

function _Component(url:string, component_class:Types.ComponentSubClass, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[Components.Base.Options?, Types.component_constraints?] = []) {
	url = Object.hasOwn(component_class, "_init_module") ?
		component_class._init_module :
		url;

	if (!url) {
		console.log(new Error().stack)
		throw new Error("Could not get the location of the UIX component '"+component_class.name+"'. This should not happen");
	}

	// deprecated message
	// if (component_class.prototype instanceof Components.Base) {
	// 	logger.warn("UIX.Components.Base is deprecated - please use UIXComponent")
	// }

	if (component_class.prototype instanceof Components.Base || component_class.prototype instanceof UIXComponent) {

		// set auto module (url from stack trace), not if module === null => resources was disabled with @NoResources
		if (url && component_class._module !== null) component_class._module = url;
		// default value of _use_resources is true (independent of parent class), if it was not overriden for this Component with @NoResources
		if (!Object.hasOwn(component_class, '_use_resources')) component_class._use_resources = true;

		// preload css files
		component_class.preloadStylesheets?.();

		const name = String(component_class.name).split(/([A-Z][a-z]+)/).filter(t=>!!t).map(t=>t.toLowerCase()).join("-"); // convert from CamelCase to snake-case

		const datex_type = Datex.Type.get("std", "uix", name);
		const options_datex_type = Datex.Type.get("uixopt", name);

		// create template class for component
		const new_class = <Types.ComponentSubClass>Datex.createTemplateClass(component_class, datex_type, true);

		const html_interface = Datex.Type.get('html').interface_config!;
		datex_type.interface_config.cast_no_tuple = html_interface.cast_no_tuple; // handle casts from object
		datex_type.interface_config.serialize = (value) => {

			// serialize html part (style, attr, content)
			const html_serialized = <Record<string,unknown>> html_interface.serialize!(value);

			// add additional properties (same as in Datex.Runtime.serializeValue)
            const pointer = Datex.Pointer.getByValue(value)
            for (const key of datex_type.visible_children){
				if (!html_serialized.p) html_serialized.p = {};
                html_serialized.p[key] = pointer?.shadow_object ? pointer.shadow_object[key]/*keep references*/ : value[key];
            }

			return html_serialized;
		}

		// component default options

		new_class.DEFAULT_OPTIONS = Object.create(Object.getPrototypeOf(new_class).DEFAULT_OPTIONS ?? Components.Base.DEFAULT_OPTIONS);
		if (!params[0]) params[0] = {};
		// set default options + title
		// ! title is overriden, even if a parent class has specified another default title
		if (!(<Components.Base.Options>params[0]).title)(<Components.Base.Options>params[0]).title = component_class.name;
		Object.assign(new_class.DEFAULT_OPTIONS, params[0])

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
		// TODO: rename, also in UIXComponent.ts
		if (component_class.prototype instanceof UIXComponent) window.customElements.define("uix2-" + name, component_class)
		else window.customElements.define("uix-" + name, component_class)
		return new_class //element_class
	}
	else throw new Error("Invalid @UIX.Component - class must extend UIX.Components.Base or UIXComponent")
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
export const CHILD_PROPS: unique symbol = Symbol("CHILD_PROPS");
export const LAYOUT_PROPS: unique symbol = Symbol("LAYOUT_PROPS");
export const IMPORT_PROPS: unique symbol = Symbol("IMPORT_PROPS");
export const STANDALONE_PROPS: unique symbol = Symbol("STANDALONE_PROPS");
export const ORIGIN_PROPS: unique symbol = Symbol("ORIGIN_PROPS");

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

/** @content to automatically assign a element id to a component property and add element to component content (#content) */
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

/** @layout to automatically assign a element id to a component property and add element to component content container layout (#layout) */
export function layout(id?:string):any
export function layout(target: any, name?: string, method?:any):any
export function layout(...args:any[]) {
	return handleDecoratorArgs(args, _layout);
}

function _layout(element_class:typeof Elements.Base, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[string?] = []) {
	if (kind != "field") {
		logger.error("@UIX.layout has to be used on a field");
		return;
	}

	setMetadata(LAYOUT_PROPS, params[0]??name);
}

/** @child to automatically assign a element id to a component property and add element as a component child */
export function child(id?:string):any
export function child(target: any, name?: string, method?:any):any
export function child(...args:any[]) {
	return handleDecoratorArgs(args, _child);
}

function _child(element_class:typeof Elements.Base, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[string?] = []) {
	if (kind != "field") {
		logger.error("@UIX.child has to be used on a field");
		return;
	}

	setMetadata(CHILD_PROPS, params[0]??name);
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



/** @standalone to declare methods that also work in a standlone context */
export function standalone(target: any, name?: string, method?:any):any
export function standalone(...args:any[]) {
	return handleDecoratorArgs(args, _standalone);
}

function _standalone(element_class:typeof Elements.Base, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter) {
	if (is_static) {
		logger.error("@UIX.standalone cannot be used on static class fields");
		return;
	}

	setMetadata(STANDALONE_PROPS, name);
}


/** @bindOrigin to declare methods that work in a standlone context, but are executed in the original context */
export function bindOrigin(options:{datex:boolean}):any
export function bindOrigin(target: any, propertyKey: string, descriptor: PropertyDescriptor):any
export function bindOrigin(_invalid_param_0_: HTMLElement, _invalid_param_1_?: string, _invalid_param_2_?: PropertyDescriptor):any

export function bindOrigin(...args:any[]) {
	return handleDecoratorArgs(args, _bindOrigin);
}

function _bindOrigin(val:(...args:any)=>any, name:context_name, kind:context_kind, is_static:boolean, is_private:boolean, setMetadata:context_meta_setter, getMetadata:context_meta_getter, params:[{datex:boolean}?] = []) {
	if (is_static) {
		logger.error("@UIX.bindOrigin cannot be used on static class fields");
		return;
	}
	setMetadata(STANDALONE_PROPS, name);
	setMetadata(ORIGIN_PROPS, params[0]??{datex:false});
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