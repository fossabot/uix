// generates typescript code for @namespace JS classes with static @expose methods
// (matching code to call the methods on another endpoint)
import { Path } from "unyt_node/path.ts";
import { $$, Datex } from "unyt_core";
import { indent } from "../utils/indent.ts";


type interf = {new(...args:unknown[]):unknown};

export function generateTS(module_name:string, module_path_or_datex_get:Path|string, values: [name:string, value:unknown, valid:boolean, no_pointer:boolean][]){

	let code = indent `
		/*
			This Typescript/JavaScript interface code was auto-generated by UIX.
			Any external DATEX resources used to generate this source code are provided without warranty of any kind.
			${typeof module_path_or_datex_get == "string" ? `Original DATEX: ${module_path_or_datex_get}` :  `Original module: ${module_name}`}
			© ${new Date().getFullYear()} unyt.org
		*/

		import { Datex, datex, endpoint, property, meta, timeout, sync, sealed } from "unyt_core";
		const logger = new Datex.Logger("${module_name}");\n\n`;

	for (const [name, val, valid, no_pointer] of values) {
		if (!valid) code += `logger.warn('Another module tried to import "${name}", which does not exist in this module. You might need to restart the backend.');\n`
		else if (typeof val == "function" && val.constructor && (<any>val)[Datex.METADATA]) code += getClassTSCode(name, <interf>val, no_pointer);
		else code += getValueTSCode(module_name, name, val, no_pointer);
	}


	return code;
}

const implicitly_converted_primitives = new Map<string, Set<string>>().setAutoDefault(Set);
const implicitly_converted = new Map<string, Set<string>>().setAutoDefault(Set);

function getValueTSCode(module_name:string, name:string, value: any, no_pointer = false) {
	let code = "";

	const type = Datex.Type.ofValue(value)
	const is_pointer = (value instanceof Datex.Value) || !!(Datex.Pointer.getByValue(value));

	if (no_pointer) {
		// no pointer
	}

	// log warning for primitive non-pointer values (cannot be converted to pointer)
	else if (type.is_primitive && (!is_pointer || implicitly_converted_primitives.get(module_name)?.has(name))) {
		code += name ? `logger.warn('The export "${name}" cannot be converted to a shared value. Consider explicitly converting it to a primitive pointer using $$().');\n` : `logger.warn('The default export cannot be converted to a shared value. Consider explicitly converting it to a primitive pointer using $$().');\n`
		implicitly_converted_primitives.getAuto(module_name).add(name);
	}

	// other value -> create pointers
	else {
		if (implicitly_converted.get(module_name)?.has(name)) {
			code += name ? `logger.warn('The export "${name}" was implicitly converted to a shared pointer value. This might have unintended side effects. Consider explicitly converting it to a ${type} pointer using $$().');\n` : `logger.warn('The default export was implicitly converted to a shared pointer value. This might have unintended side effects. Consider explicitly converting it to a ${type} pointer using $$().');\n`
		}
		
		// special convertions for non-pointer values
		if (!is_pointer) {
			// convert es6 class with static properties
			if (typeof value == "function" && /^\s*class/.test(value.toString())) {
				// convert static class to normal object
				const original_value = value;
				value = {}
				for (const prop of Object.getOwnPropertyNames(original_value)) {
					if (prop != "length" && prop != "name" && prop != "prototype") {
						value[prop] = typeof original_value[prop] == "function" ? $$(Datex.Function.createFromJSFunction(original_value[prop], original_value)) : $$(original_value[prop]);
					}
				}
			}
			
			// convert Function to DATEX Function
			else if (value instanceof Function) value = Datex.Function.createFromJSFunction(value); 

			// log warning for non-pointer arrays and object
			else if (type == Datex.Type.std.Array || type == Datex.Type.std.Object) {
				code += name ? `logger.warn('The export "${name}" was implicitly converted to a shared pointer value. This might have unintended side effects. Consider explicitly converting it to a ${type} pointer using $$().');\n` : `logger.warn('The default export was implicitly converted to a shared pointer value. This might have unintended side effects. Consider explicitly converting it to a ${type} pointer using $$().');\n`
				implicitly_converted.getAuto(module_name).add(name);
			}
		}
		
		value = $$(value);
	}

	// disable garbage collection
	const ptr = <Datex.Pointer> Datex.Pointer.getByValue(value);
	if (ptr) ptr.is_persistant = true;

	code += `${name =='default' ? 'export default' : 'export const ' + name + ' ='} await datex(\`${Datex.Runtime.valueToDatexStringExperimental(value)}\`) as ${getValueTSType(value)};\n`;
	return code;
}


function getValueDTSCode(module_name:string, name:string, value: any, no_pointer = false) {
	let code = "";

	if (name =='default') {
		name = `_default`;
		code += `declare const ${name}: ${getValueTSType(value)};\nexport default ${name};\n`
	}
	else {
		code += `export const ${name}: ${getValueTSType(value)}\n`
	}

	return code;
}


function getClassTSCode(name:string, interf: interf, no_pointer = false) {

	const metadata = (<any>interf)[Datex.METADATA];
	const meta_scope_name = metadata[Datex.Decorators.NAMESPACE]?.constructor;
	let meta_endpoint = metadata[Datex.Decorators.SEND_FILTER]?.constructor;
	if (meta_endpoint == true) meta_endpoint = Datex.Runtime.endpoint; // deafult is local endpoint
	const meta_is_sync = metadata[Datex.Decorators.IS_SYNC]?.constructor;
	const meta_is_sealed = metadata[Datex.Decorators.IS_SEALED]?.constructor;
    const meta_timeout = metadata[Datex.Decorators.TIMEOUT]?.public;
    const meta_meta_index = metadata[Datex.Decorators.META_INDEX]?.public;

	let fields = "";

	// static and non-static properties
	const properties = metadata[Datex.Decorators.PROPERTY]?.public;
	// console.log("props",metadata)
	
	for (const prop of Object.keys(properties??{})) {
		// console.log((<any>interf.prototype)[prop]?.toString());
		fields += `
	@property${meta_timeout?.[prop]?` @timeout(${meta_timeout[prop]})`:''} public ${prop}() {}
`
	}

	const static_properties = metadata[Datex.Decorators.STATIC_PROPERTY]?.public;
	
	for (const prop of Object.keys(static_properties??{})) {
		// console.log((<any>interf)[prop]?.toString());
		fields += `
	@property${meta_timeout?.[prop]?` @timeout(${meta_timeout[prop]})`:''} public static ${prop}() {}
`
	}	
	

	return `
${meta_endpoint?`@endpoint("${meta_endpoint.toString()}"${meta_scope_name?`, "${meta_scope_name}"`:''})`:''}${meta_is_sync?' @sync':''}${meta_is_sync?' @sealed':''} export ${name == 'default' ? 'default ' : ''}class ${(name == 'default')?'DatexValue' : name} {
${fields}
}
`
}


function getValueTSType(value:any) {
	const dx_type = Datex.Type.ofValue(value).root_type;
	const [ts_type, is_primitive] = DX_TS_TYPE_MAP.get(dx_type)??[];
	const is_pointer = (value instanceof Datex.Value) || !!(Datex.Pointer.getByValue(value));
	const wrap_pointer = is_pointer && is_primitive;

	if (wrap_pointer) return ts_type ? `Datex.Pointer<${ts_type}>` : 'any'
	else return ts_type ?? 'any';
}


// generate d.ts file (for DATEX module)
export function generateDTS(module_name:string, module_path_or_datex_get:Path|string, values: [name:string, value:unknown, valid:boolean, no_pointer:boolean][]) {
	let code = indent `
		/*
			This TypeScript definition file was auto-generated by UIX.
			${typeof module_path_or_datex_get == "string" ? `Original DATEX: ${module_path_or_datex_get}` : `Original DATEX module: ${module_path_or_datex_get}`}
			© ${new Date().getFullYear()} unyt.org
		*/
		
		import { Datex } from "unyt_core";\n\n`

	for (const [name, val, valid, no_pointer] of values) {
		if (!valid) {}
		else if (typeof val == "function" && val.constructor && (<any>val)[Datex.METADATA]) code += getClassTSCode(name, <interf>val, no_pointer);
		else code += getValueDTSCode(module_name, name, val, no_pointer);
	}

	return code;
}


export const DX_TS_TYPE_MAP = new Map<Datex.Type,[string,boolean]>([
	[Datex.Type.std.text, ["string", true]],
	[Datex.Type.std.integer, ["bigint", true]],
	[Datex.Type.std.decimal, ["number", true]],
	[Datex.Type.std.quantity, ["Datex.Quantity<any>", false]],
	[Datex.Type.std.url, ["URL", false]],
	[Datex.Type.std.boolean, ["boolean", true]],
	[Datex.Type.std.void, ["undefined", true]],
	[Datex.Type.std.null, ["null", true]],
	[Datex.Type.std.time, ["Datex.Time", false]],
	[Datex.Type.std.endpoint, ["Datex.Endpoint", false]],
	[Datex.Type.std.Error, ["Datex.Error", false]],
	[Datex.Type.std.Tuple, ["Datex.Tuple", false]],
	[Datex.Type.std.Type, ["Datex.Type", false]],

	[Datex.Type.std.Any, ["any", false]],
	[Datex.Type.std.Object, ["Record<string,any>", false]],
	[Datex.Type.std.Array, ["any[]", false]],
	[Datex.Type.std.Function, ["(...args:any[]) => Promise<any>", false]],
	[Datex.Type.std.Map, ["Map<any,any>", false]],
	[Datex.Type.std.Set, ["Set<any>", false]],

	[Datex.Type.get('std','html'), ["HTMLElement", false]],
	[Datex.Type.get('std','html','div'), ["HTMLDivElement", false]],
])