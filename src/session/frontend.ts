import { Datex } from "datex-core-legacy";
import { UIX_COOKIE, getCookie, setCookie } from "./cookies.ts";
import { getSharedDataPointer } from "./shared-data.ts";

export function initSession() {

	Datex.Runtime.onEndpointChanged(()=>{
		const endpointName = Datex.Runtime.endpoint.toString();
		if (getCookie(UIX_COOKIE.endpoint) !== endpointName)
			setCookie(UIX_COOKIE.endpoint, Datex.Runtime.endpoint.toString());
	})

	if ((globalThis as any).cookieStore) {
		((globalThis as any).cookieStore).addEventListener('change', ({changed}: {changed:any}) => {
			for (const {name, value} of changed) {
				if (name == UIX_COOKIE.sharedData) {
					console.debug("shared data cookie was updated")
				}
			}
		});
	}
	
}

let sharedData:Record<string, unknown> & {[Symbol.dispose]?:()=>void}|undefined;
let update:Function|undefined;

export async function getSharedData<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T & {[Symbol.dispose]?:()=>void}> {
	if (!sharedData) {
		({sharedData, update} = await getSharedDataPointer());
	}
	return sharedData as T;
}

export async function saveSharedData() {
	if (!update) {
		({sharedData, update} = await getSharedDataPointer());
	}
	return update();
}