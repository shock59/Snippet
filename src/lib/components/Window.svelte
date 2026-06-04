<script module lang="ts">
	type WindowRef = {
		id: symbol;
		name: string;
		setZ: (z: number) => void;
	};

	const windowLogger = createLogger('windows');

	const baseZ = 30;

	let windowStack: WindowRef[] = [];

	function syncZIndices() {
		windowLogger('syncing z indexes');
		for (let i = 0; i < windowStack.length; i++) {
			windowStack[i].setZ(baseZ + i);
		}
	}

	export function registerWindow(name: string, setZ: (z: number) => void) {
		const ref: WindowRef = {
			id: Symbol(name),
			name,
			setZ
		};
		windowLogger('registering window', ref);

		windowStack.push(ref);
		syncZIndices();

		return {
			ref,

			bringToFront() {
				const index = windowStack.indexOf(ref);
				if (index === -1) return;

				if (index === windowStack.length - 1) return;
				windowLogger(name, 'brought to front');

				windowStack.splice(index, 1);
				windowStack.push(ref);

				syncZIndices();
			},

			unregister() {
				const index = windowStack.indexOf(ref);
				if (index !== -1) {
					windowLogger(name, 'unregistered');
					windowStack.splice(index, 1);
					syncZIndices();
				}
			}
		};
	}
</script>

<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { onMouseUp, staticMouseX, staticMouseY } from '$lib/globals';
	import { onAnimationFrame } from '$lib/utils';
	import { X } from '@lucide/svelte';
	import { fade, slide } from 'svelte/transition';
	import { createLogger } from '$lib/debug';

	type UnitValue = `${number}px` | `${number}%` | number;

	type Anchor =
		| 'top-left'
		| 'top-center'
		| 'top-right'
		| 'center-left'
		| 'center'
		| 'center-right'
		| 'bottom-left'
		| 'bottom-center'
		| 'bottom-right';

	type RelativeBounds = {
		x?: UnitValue;
		y?: UnitValue;
		width?: UnitValue;
		height?: UnitValue;
		anchor?: Anchor;
	};

	type Props = {
		open?: boolean;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		name?: string;
		bounds?: RelativeBounds;
		icon?: Snippet;
		children?: Snippet;
	};

	let {
		open = $bindable(false),
		x = $bindable(20),
		y = $bindable(10),
		width = $bindable(500),
		height = $bindable(400),
		name = 'Window',
		bounds,
		icon,
		children
	}: Props = $props();

	const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

	function resolveUnit(value: UnitValue | undefined, total: number, fallback: number) {
		if (value == null) return fallback;

		if (typeof value === 'number') return value;

		if (value.endsWith('%')) {
			return (parseFloat(value) / 100) * total;
		}

		if (value.endsWith('px')) {
			return parseFloat(value);
		}

		return fallback;
	}

	function getAnchorOffset(anchor: Anchor, width: number, height: number) {
		switch (anchor) {
			case 'top-left':
				return { x: 0, y: 0 };

			case 'top-center':
				return { x: width / 2, y: 0 };

			case 'top-right':
				return { x: width, y: 0 };

			case 'center-left':
				return { x: 0, y: height / 2 };

			case 'center':
				return { x: width / 2, y: height / 2 };

			case 'center-right':
				return { x: width, y: height / 2 };

			case 'bottom-left':
				return { x: 0, y: height };

			case 'bottom-center':
				return { x: width / 2, y: height };

			case 'bottom-right':
				return { x: width, y: height };
		}
	}

	let zIndex = $state(100);

	// svelte-ignore state_referenced_locally
	const manager = registerWindow(name, (z) => {
		zIndex = z;
	});

	const bringToFront = manager.bringToFront;

	const minWidth = 200;
	const minHeight = 120;

	const titlebarHeight = 24;
	const minVisX = 20;

	function startResize(e: MouseEvent, handle: string) {
		e.stopPropagation();

		const startX = staticMouseX;
		const startY = staticMouseY;
		const startWidth = width;
		const startHeight = height;
		const startLeft = x;
		const startTop = y;

		const stop = onAnimationFrame(() => {
			const dx = staticMouseX - startX;
			const dy = staticMouseY - startY;

			let nextWidth = startWidth;
			let nextHeight = startHeight;

			let nextX = startLeft;
			let nextY = startTop;

			if (handle.includes('e')) {
				nextWidth = startWidth + dx;
			}

			if (handle.includes('s')) {
				nextHeight = startHeight + dy;
			}

			if (handle.includes('w')) {
				nextWidth = startWidth - dx;
				nextX = startLeft + dx;
			}

			if (handle.includes('n')) {
				nextHeight = startHeight - dy;
				nextY = startTop + dy;
			}

			if (nextWidth < minWidth) {
				if (handle.includes('w')) {
					nextX -= minWidth - nextWidth;
				}

				nextWidth = minWidth;
			}

			if (nextHeight < minHeight) {
				if (handle.includes('n')) {
					nextY -= minHeight - nextHeight;
				}

				nextHeight = minHeight;
			}

			const constrained = constrainPosition(nextX, nextY, nextWidth);

			x = constrained.x;
			y = constrained.y;

			width = nextWidth;
			height = nextHeight;
		});

		onMouseUp(stop);
	}

	function startDrag() {
		const xOffset = staticMouseX - x;
		const yOffset = staticMouseY - y;

		const stop = onAnimationFrame(() => {
			const nextX = staticMouseX - xOffset;
			const nextY = staticMouseY - yOffset;

			const constrained = constrainPosition(nextX, nextY, width);

			x = constrained.x;
			y = constrained.y;
		});

		onMouseUp(stop);
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function constrainPosition(nextX: number, nextY: number, windowWidth: number) {
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;

		return {
			x: clamp(nextX, minVisX - windowWidth, screenWidth - minVisX),

			y: clamp(nextY, 0, screenHeight - titlebarHeight)
		};
	}

	let initialized = false;

	$effect(() => {
		if (!open) return;
		untrack(() => bringToFront());
		if (!initialized && bounds) {
			const screenWidth = window.innerWidth;
			const screenHeight = window.innerHeight;

			const resolvedWidth = resolveUnit(bounds.width, screenWidth, width);
			const resolvedHeight = resolveUnit(bounds.height, screenHeight, height);

			const rawX = resolveUnit(bounds.x, screenWidth, x);
			const rawY = resolveUnit(bounds.y, screenHeight, y);

			const anchor = bounds.anchor ?? 'top-left';

			const offset = getAnchorOffset(anchor, resolvedWidth, resolvedHeight);

			width = resolvedWidth;
			height = resolvedHeight;

			x = rawX - offset.x;
			y = rawY - offset.y;

			initialized = true;
		}
	});
	onDestroy(() => {
		manager.unregister();
	});
</script>

<div class="pointer-events-none fixed inset-0" style="z-index: {zIndex};">
	<!-- {#if !open}
		<button
			transition:fade={{ duration: 120 }}
			class="pointer-events-auto absolute top-1 left-1 rounded-md p-0.5 hover:bg-accent"
			onclick={() => {
				open = true;
				bringToFront();
			}}
		>
			{@render icon?.()}
		</button>
	{/if} -->

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			transition:slide
			style="
				position: absolute;
				left: {x}px;
				top: {y}px;
				width: {width}px;
				height: {height}px;
				
				filter: drop-shadow(0px 0px 20px var(--background));
			"
			class="pointer-events-auto flex flex-col rounded-xl border-2 bg-popover select-none"
			onmousedown={bringToFront}
		>
			{#each handles as handle}
				<div
					role="button"
					tabindex={0}
					class="resize-handle {handle}"
					onmousedown={(e) => startResize(e, handle)}
				></div>
			{/each}

			<div
				role="button"
				tabindex="0"
				class="relative flex min-h-6 w-full cursor-grab flex-row items-center active:cursor-grabbing"
				onmousedown={startDrag}
			>
				<div class="absolute left-1 rounded-md">
					{@render icon?.()}
				</div>

				<span class="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm select-none">
					{name}
				</span>

				<button
					class="absolute right-1 rounded-md hover:bg-destructive/10 hover:text-destructive"
					onclick={() => (open = false)}
				>
					<X size="1em" />
				</button>
			</div>

			<div class="flex min-h-0 w-full grow flex-col rounded-sm border-t border-t-border/30 p-2">
				{@render children?.()}
			</div>
		</div>
	{/if}
</div>

<style>
	.resize-handle {
		position: absolute;
		--edge-handle-size: 6px;
		--edge-handle-offset: -5px;
		--corner-handle-size: 8px;
		--corner-handle-offset: -5px;
	}

	.resize-handle.n {
		top: var(--edge-handle-offset);
		left: 0;
		width: 100%;
		height: var(--edge-handle-size);
		cursor: n-resize;
	}
	.resize-handle.s {
		bottom: var(--edge-handle-offset);
		left: 0;
		width: 100%;
		height: var(--edge-handle-size);
		cursor: s-resize;
	}
	.resize-handle.e {
		right: var(--edge-handle-offset);
		top: 0;
		width: var(--edge-handle-size);
		height: 100%;
		cursor: e-resize;
	}
	.resize-handle.w {
		left: var(--edge-handle-offset);
		top: 0;
		width: var(--edge-handle-size);
		height: 100%;
		cursor: w-resize;
	}
	.resize-handle.ne {
		top: var(--corner-handle-offset);
		right: var(--corner-handle-offset);
		width: var(--corner-handle-size);
		height: var(--corner-handle-size);
		cursor: ne-resize;
	}
	.resize-handle.nw {
		top: var(--corner-handle-offset);
		left: var(--corner-handle-offset);
		width: var(--corner-handle-size);
		height: var(--corner-handle-size);
		cursor: nw-resize;
	}
	.resize-handle.se {
		bottom: var(--corner-handle-offset);
		right: var(--corner-handle-offset);
		width: var(--corner-handle-size);
		height: var(--corner-handle-size);
		cursor: se-resize;
	}
	.resize-handle.sw {
		left: var(--corner-handle-offset);
		bottom: var(--corner-handle-offset);
		width: var(--corner-handle-size);
		height: var(--corner-handle-size);
		cursor: sw-resize;
	}
</style>
