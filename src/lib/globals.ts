import { get, writable, type Writable } from 'svelte/store';
import { registerKeybind } from './kbd';

export const mouseX = writable(0);
export const mouseY = writable(0);
export let staticMouseX = 0;
export let staticMouseY = 0;
mouseX.subscribe((v) => {
	staticMouseX = v;
});

mouseY.subscribe((v) => {
	staticMouseY = v;
});

export const mouseUpCallbacks: (() => void)[] = [];

export function onMouseUp(cb: () => void) {
	mouseUpCallbacks.push(cb);
}


export const states = writable<Record<string, Record<string, any>>>({});

export function registerState(w: Writable<Record<string, any>>, name: string) {
	// states.set({ ...get(states), [name]: w });
	w.subscribe((v) => {
		states.set({
			...get(states),
			[name]: v
		});
	});
}

export const debuggerOpen = writable(false);
