import { browser } from '$app/environment';
import { clsx, type ClassValue } from 'clsx';
import { get, writable, type Subscriber, type Unsubscriber } from 'svelte/store';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

type FrameCallback = (deltaTime: number) => void;

interface Listener {
	id: number;
	priority: number;
	callback: FrameCallback;
}

class AnimationFrameManager {
	private listeners: Listener[] = [];
	private frameId: number | null = null;
	private lastTime = performance.now();
	private nextId = 0;

	start() {
		if (!browser) return;
		if (this.frameId !== null) return;

		this.lastTime = performance.now();

		const loop = () => {
			const now = performance.now();
			const dt = now - this.lastTime;
			this.lastTime = now;

			for (const listener of this.listeners) {
				listener.callback(dt);
			}

			this.frameId = requestAnimationFrame(loop);
		};

		this.frameId = requestAnimationFrame(loop);
	}

	stop() {
		if (this.frameId !== null) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
	}

	subscribe(callback: FrameCallback, priority = 0) {
		const id = this.nextId++;

		this.listeners.push({
			id,
			priority,
			callback
		});

		this.listeners.sort((a, b) => {
			if (a.priority === b.priority) {
				return a.id - b.id;
			}

			return a.priority - b.priority;
		});

		this.start();

		return () => {
			this.listeners = this.listeners.filter((x) => x.id !== id);

			if (this.listeners.length === 0) {
				this.stop();
			}
		};
	}
}

export const animationFrameManager = new AnimationFrameManager();

export function onAnimationFrame(callback: FrameCallback, priority = 0) {
	return animationFrameManager.subscribe(callback, priority);
}

export const useKibi = writable(false);

type ByteFormatter = {
	(bytes: number): string;
	subscribe: (run: Subscriber<(bytes: number) => string>, invalidate?: () => void) => Unsubscriber;
};

function fbytes(bytes: number, kibi = get(useKibi)): string {
	bytes = Math.round(bytes);
	const thresh = kibi ? 1024 : 1000;
	if (Math.abs(bytes) < thresh) {
		return bytes + ' B';
	}
	const units = kibi
		? ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
		: ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	let u = -1;
	do {
		bytes /= thresh;
		++u;
	} while (Math.abs(bytes) >= thresh && u < units.length - 1);
	return bytes.toFixed(1) + ' ' + units[u];
}

const formatBytesWritable = writable((bytes: number) => fbytes(bytes, false));

export const formatBytes: ByteFormatter = fbytes as any;
formatBytes.subscribe = formatBytesWritable.subscribe;

useKibi.subscribe((value) => {
	formatBytesWritable.set((bytes: number) => fbytes(bytes, value));
});

/**
 * will probably cause hydration errors but i dont care lmfao
 */
export function ifBrowser<T>(fn: () => T): T {
	if (browser) {
		return fn();
	}
	return null as T;
}

export interface MeasureTextOptions {
	fontFamily?: string;
	fontSize?: string;
	fontWeight?: string;
	fontStyle?: string;
}

export function measureText(node: HTMLElement, text: string, options?: MeasureTextOptions): DOMRect;
export function measureText(text: string, options?: MeasureTextOptions): DOMRect | null;

export function measureText(
	a0: string | HTMLElement,
	a1?: string | MeasureTextOptions,
	a2?: MeasureTextOptions
): DOMRect | null {
	if (!browser) return null;

	let node: HTMLElement = document.body;
	let textToMeasure = '';
	let options: MeasureTextOptions | undefined;

	if (typeof a0 === 'string') {
		textToMeasure = a0;
		options = a1 as MeasureTextOptions;
	} else if (a0 instanceof HTMLElement) {
		node = a0;
		textToMeasure = a1 as string;
		options = a2;
	}

	const span = document.createElement('span');
	span.textContent = textToMeasure;
	span.style.position = 'absolute';
	span.style.visibility = 'hidden';
	span.style.whiteSpace = 'nowrap';

	if (options?.fontFamily) span.style.fontFamily = options.fontFamily;
	if (options?.fontSize) span.style.fontSize = options.fontSize;
	if (options?.fontWeight) span.style.fontWeight = options.fontWeight;
	if (options?.fontStyle) span.style.fontStyle = options.fontStyle;

	node.appendChild(span);
	const rect = span.getBoundingClientRect();
	span.remove();

	return rect;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
