import { get, writable, type Writable } from 'svelte/store';
import { registerKeybind } from './kbd';
import { browser } from '$app/environment';

export const mouseX = writable(0);
export const mouseY = writable(0);

export let staticMouseX = 0;
export let staticMouseY = 0;

export const mouseXMomentum = writable(0);
export const mouseYMomentum = writable(0);

const window = 300;
const decay = 0.85;
const stopAfter = 50;
const minMomentum = 0.01;

interface Sample {
	x: number;
	y: number;
	t: number;
}

const samples: Sample[] = [];
let lastMoveTime = 0;
let rafId: number | null = null;
let currentVx = 0;
let currentVy = 0;

function pruneSamples(now: number): void {
	const cutoff = now - window;
	while (samples.length > 1 && samples[0].t < cutoff) {
		samples.shift();
	}
}

function decayLoop(): void {
	const now = performance.now();

	if (now - lastMoveTime > stopAfter) {
		currentVx *= decay;
		currentVy *= decay;

		if (Math.abs(currentVx) < minMomentum) currentVx = 0;
		if (Math.abs(currentVy) < minMomentum) currentVy = 0;

		mouseXMomentum.set(currentVx);
		mouseYMomentum.set(currentVy);

		if (currentVx === 0 && currentVy === 0) {
			rafId = null;
			return;
		}
	}

	rafId = requestAnimationFrame(decayLoop);
}

export function __onMouseMove(e: MouseEvent): void {
	const now = performance.now();
	const { clientX: x, clientY: y } = e;

	mouseX.set(x);
	mouseY.set(y);
	staticMouseX = x;
	staticMouseY = y;

	samples.push({ x, y, t: now });
	pruneSamples(now);
	lastMoveTime = now;

	if (samples.length >= 2) {
		const oldest = samples[0];
		const newest = samples[samples.length - 1];
		const dt = newest.t - oldest.t;

		if (dt > 0) {
			currentVx = (newest.x - oldest.x) / dt;
			currentVy = (newest.y - oldest.y) / dt;
			mouseXMomentum.set(currentVx);
			mouseYMomentum.set(currentVy);
		}
	}

	if (rafId === null) {
		rafId = requestAnimationFrame(decayLoop);
	}
}

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

const cssCursors = [
	'alias',
	'all-scroll',
	'auto',
	'cell',
	'col-resize',
	'context-menu',
	'copy',
	'crosshair',
	'default',
	'e-resize',
	'ew-resize',
	'grab',
	'grabbing',
	'help',
	'move',
	'n-resize',
	'ne-resize',
	'nesw-resize',
	'no-drop',
	'none',
	'not-allowed',
	'ns-resize',
	'nw-resize',
	'nwse-resize',
	'pointer',
	'progress',
	'row-resize',
	's-resize',
	'se-resize',
	'sw-resize',
	'text',
	'vertical-text',
	'w-resize',
	'wait',
	'zoom-in',
	'zoom-out'
] as const;

type CSSCursor = (typeof cssCursors)[number];

export const cursor = writable<CSSCursor>('auto');

let cursorId = 0;

export function setCursor(newCursor: CSSCursor) {
	const id = ++cursorId;
	cursor.set(newCursor);

	return () => {
		if (id === cursorId) {
			cursor.set('auto');
		}
	};
}

cursor.subscribe((value) => {
	if (browser) document.body.style.setProperty('cursor', value, 'important');
});
