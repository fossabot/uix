import { Path } from "unyt_node/path.ts";
import { $$ } from "unyt_core";
import { HTMLUtils } from "../html/utils.ts";
import { getCallerFile } from "unyt_core/utils/caller_metadata.ts";

const jsxFragment = 'jsx.Fragment'
const jsxTextNode = 'jsx.Text'

type jsxDOMContainer = HTMLElement | DocumentFragment | null
type jsxDOMElement = HTMLElement | DocumentFragment | Text

export function jsx (type: string | any, config: JSX.ElementChildrenAttribute): jsxDOMElement {

	let element:HTMLElement;
	let { children = [], ...props } = config
	if (!(children instanceof Array)) children = [children];

	let init_children = true;
	let init_attributes = true;

	if (typeof type === 'function') {
		// class extending HTMLElement
		if (HTMLElement.isPrototypeOf(type) || type === DocumentFragment || DocumentFragment.isPrototypeOf(type)) {
			element = new type(props) // uix component
			init_attributes = false;
		}
		else {
			element = type(config) // function
			// TODO:
			init_children = false;
			init_attributes = true;
		}
	}
	else element = <HTMLElement> document.createElement(type);

	if (init_attributes) {
		for (let [key,val] of Object.entries(props)) {
			if (key == "style") HTMLUtils.setCSS(element, <any> val);
			else {
				if (typeof val == "string" && (val.startsWith("./") || val.startsWith("../"))) {
					val = new Path(val, props['module'] ?? getCallerFile()).toString();
				}
				HTMLUtils.setElementAttribute(element, key, <any>val, props['module'] ?? getCallerFile());
			}
		}
	}

	if (init_children) {
		for (const child of children) {
			HTMLUtils.append(element, child);
		}
	}

	// !important, cannot return directly because of stack problems, store in ptr variable first
	const ptr = $$(element);
	return ptr;
}

jsx.Fragment = jsxFragment
jsx.TextNode = jsxTextNode
jsx.customAttributes = ['children', 'key', 'props']

// TODO: handle separate
export const jsxs = jsx;


declare global {
	namespace JSX {
	  // JSX node definition
	  type Element = HTMLElement

	  type ElementClass = jsxDOMElement
    
	  // Property that will hold the HTML attributes of the Component
	  interface ElementAttributesProperty {
		props: Record<string,string>;
	  }
  
	  // Property in 'props' that will hold the children of the Component
	  interface ElementChildrenAttribute {
		children: HTMLElement[]
	  }
  
	  // Common attributes of the standard HTML elements and JSX components
	  interface IntrinsicAttributes {
		class?: string
		id?: string,
		name?: string,
		style?: string|Record<string,string>,

		[key: string]: any
	  }
  
	  // Common attributes of the UIX components only
	  interface IntrinsicClassAttributes<ComponentClass> {
  
	  }
  
	  // HTML elements allowed in JSX, and their attributes definitions
	  type IntrinsicElements = {
		[key in keyof HTMLElementTagNameMap]: IntrinsicAttributes
	  }
	}
  }