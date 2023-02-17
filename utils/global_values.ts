import { Datex } from "unyt_core";
import type { Components } from "../components/main.ts"
import type { Types } from "./global_types.ts";

export const logger = new Datex.Logger("UIX");

// app container
export const root_container = document.querySelector(".root-container") ?? document.createElement("main") 
root_container.classList.add("root-container");


// notification container
export const notification_container = document.createElement("aside"); 
notification_container.classList.add("notification-container");



export const global_states = {
	shift_pressed: false,
	meta_pressed: false,
	mouse_x: 0,
	mouse_y: 0
}



export const unsaved_components = new Set<Components.Base>();
export const abstract_component_classes = new Set<Types.ComponentSubClass>(); // set including all classes marked as @UIX.Abstract
export const component_classes = new Map<Datex.Type, Types.ComponentSubClass>();
export const component_groups = new Map<string, Set<Types.ComponentSubClass>>();

