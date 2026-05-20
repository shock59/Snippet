import { browser } from '$app/environment';
import { clsx, type ClassValue } from 'clsx';
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

export function onAnimationFrame(
	callback: FrameCallback,
	priority = 0
) {
	return animationFrameManager.subscribe(callback, priority);
}