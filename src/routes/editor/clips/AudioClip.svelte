<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { AudioClip } from '$lib/media/types';
	import { scalenum } from '$lib';
	import { onAnimationFrame } from '$lib/utils';

	const barWidth = 2;
	const barSpacing = 3;
	const overscan = 600;
	const debounce = 380;
	const staggerMs = 420;
	const barIn = 160;
	const barOut = 100;
	const waveformPps = 100;

	type Props = { clip: AudioClip; inTimeline?: boolean; zoom?: number; bounds?: ClipBounds };
	let { clip, inTimeline = false, zoom = 100, bounds }: Props = $props();

	let containerEl: HTMLDivElement | null = $state(null);
	let canvasEl: HTMLCanvasElement | null = $state(null);

	interface Bar {
		idx: number;
		value: number;
		height: number;
		staggerDelay: number;
	}

	let bars = new Map<number, Bar>();
	// svelte-ignore state_referenced_locally
	let drawnZoom = zoom;

	type Phase = 'idle' | 'hiding' | 'showing';
	let phase: Phase = $state('idle');

	let hideStart = 0;
	let showStart = 0;

	let ignore = false;

	let rafHandle: number | null = null;
	let debounceHandle: ReturnType<typeof setTimeout> | null = null;
	// svelte-ignore state_referenced_locally
	let pendingZoom = zoom;
	// svelte-ignore state_referenced_locally
	let prevZoom = zoom;

	let setupDone = false;
	let initialized = false;
	let canvasOffsetX = 0;
	let pendingResize: { w: number; h: number; offsetX: number } | null = null;

	let scrollParent: Element | null = null;
	let unlistenScroll: (() => void) | null = null;

	const easeOut = (t: number) => 1 - (1 - t) ** 3;

	function barValue(idx: number, z: number): number {
		const wf = clip.asset?.waveform;
		if (!wf?.length) return 0;
		const t0 = (idx * barSpacing) / z;
		const t1 = t0 + barSpacing / z;
		const s0 = Math.floor(t0 * waveformPps);
		const s1 = Math.ceil(t1 * waveformPps);
		let peak = 0;
		for (let s = Math.max(0, s0); s < Math.min(wf.length, s1); s++) {
			if (wf[s] > peak) peak = wf[s];
		}
		return peak;
	}

	function getVisible(): [number, number] | null {
		if (!containerEl || !scrollParent) return null;
		const clipR = containerEl.getBoundingClientRect();
		const scrollR = scrollParent.getBoundingClientRect();
		const visLeft = Math.max(0, scrollR.left - clipR.left);
		const visRight = Math.min(clipR.width, scrollR.right - clipR.left);
		return visRight > visLeft ? [visLeft, visRight] : null;
	}

	function toBarRange(visLeft: number, visRight: number, clipWidthPx: number): [number, number] {
		const maxBar = Math.ceil(clipWidthPx / barSpacing);
		const ob = Math.ceil(overscan / barSpacing);
		return [
			Math.max(0, Math.floor(visLeft / barSpacing) - ob),
			Math.min(maxBar, Math.ceil(visRight / barSpacing) + ob)
		];
	}

	function findScrollParent(el: Element): Element {
		let p: Element | null = el.parentElement;
		while (p && p !== document.documentElement) {
			const { overflow, overflowX } = getComputedStyle(p);
			if (/auto|scroll/.test(overflow + overflowX)) return p;
			p = p.parentElement;
		}
		return document.documentElement;
	}

	function queueResize(visLeft: number, visRight: number, clipWidthPx: number) {
		if (!containerEl) return;
		const offsetX = Math.max(0, visLeft - overscan);
		const rightLocal = Math.min(clipWidthPx, visRight + overscan);
		pendingResize = {
			w: Math.max(1, Math.round(rightLocal - offsetX)),
			h: Math.round(containerEl.clientHeight) || 40,
			offsetX
		};
	}

	function canvasCoversVis(visLeft: number, visRight: number): boolean {
		if (!canvasEl) return false;
		return (
			visLeft - overscan / 2 >= canvasOffsetX &&
			visRight + overscan / 2 <= canvasOffsetX + canvasEl.width
		);
	}

	function buildAndShow(z: number) {
		if (ignore) return;
		drawnZoom = z;

		const vis = getVisible();
		if (!vis || !containerEl) return;
		const [visLeft, visRight] = vis;
		const clipW = containerEl.getBoundingClientRect().width;

		initialized = true;
		phase = 'idle';
		bars.clear();
		queueResize(visLeft, visRight, clipW);

		const [first, last] = toBarRange(visLeft, visRight, clipW);
		const visFirst = Math.floor(visLeft / barSpacing);
		const visLast = Math.ceil(visRight / barSpacing);
		const visCount = Math.max(1, visLast - visFirst);
		const staggerStep = staggerMs / visCount;

		for (let idx = first; idx < last; idx++) {
			const value = barValue(idx, z);
			const inView = idx >= visFirst && idx < visLast;
			bars.set(idx, {
				idx,
				value,
				height: inView ? 0 : value,
				staggerDelay: inView ? (idx - visFirst) * staggerStep : -1
			});
		}

		phase = 'showing';
		showStart = performance.now();
		scheduleDraw();
	}

	function update(force = false) {
		if (phase === 'hiding' || !containerEl || !setupDone) return;
		if (ignore) return;
		if (!initialized) {
			buildAndShow(drawnZoom);
			return;
		}

		const vis = getVisible();
		if (!vis) return;
		const [visLeft, visRight] = vis;
		const clipW = containerEl.getBoundingClientRect().width;

		if (!canvasCoversVis(visLeft, visRight)) {
			queueResize(visLeft, visRight, clipW);
		}

		const [first, last] = toBarRange(visLeft, visRight, clipW);
		for (const idx of bars.keys()) {
			if (idx < first || idx >= last) bars.delete(idx);
		}
		for (let idx = first; idx < last; idx++) {
			if (!bars.has(idx)) {
				const v = barValue(idx, drawnZoom);
				bars.set(idx, { idx, value: v, height: v, staggerDelay: -1 });
			}
		}
		if (force) tick(performance.now());
		else scheduleDraw();
	}

	function onZoomChange(z: number) {
		pendingZoom = z;
		ignore = true;
		if (phase !== 'hiding' && bars.size > 0) {
			phase = 'hiding';
			hideStart = performance.now();
			scheduleDraw();
		}
		clearTimeout(debounceHandle!);
		debounceHandle = setTimeout(() => {
			debounceHandle = null;
			ignore = false;
			buildAndShow(pendingZoom);
		}, debounce);
	}

	function scheduleDraw() {
		if (rafHandle === null) rafHandle = requestAnimationFrame(tick);
	}

	function tick(now: number) {
		rafHandle = null;
		if (!canvasEl) return;

		if (pendingResize) {
			const { w, h, offsetX } = pendingResize;
			pendingResize = null;
			canvasEl.width = w;
			canvasEl.height = h;
			canvasOffsetX = offsetX;
			canvasEl.style.left = `${offsetX}px`;
		}

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		const W = canvasEl.width;
		const H = canvasEl.height;
		const maxBarH = H * 0.7;

		ctx.clearRect(0, 0, W, H);
		let more = false;

		if (phase === 'hiding') {
			const t = Math.min(1, (now - hideStart) / barOut);
			const f = 1 - easeOut(t);
			for (const bar of bars.values()) {
				const elapsed = now - showStart - bar.staggerDelay;
				const t = Math.min(1, elapsed / barIn);
				const inHeight = bar.value * easeOut(t);
				bar.height = inHeight * f;
			}
			if (t < 1) {
				more = true;
			} else {
				bars.clear();
				phase = 'idle';
			}
		} else if (phase === 'showing') {
			for (const bar of bars.values()) {
				if (bar.staggerDelay < 0) continue;
				const elapsed = now - showStart - bar.staggerDelay;
				if (elapsed <= 0) {
					bar.height = 0;
					more = true;
				} else {
					const t = Math.min(1, elapsed / barIn);
					bar.height = bar.value * easeOut(t);
					if (t < 1) more = true;
				}
			}
			if (!more) phase = 'idle';
		}

		ctx.fillStyle = '#ffffff';
		for (const bar of bars.values()) {
			if (bar.height < 0.0001) continue;
			const x = Math.round(bar.idx * barSpacing - canvasOffsetX);
			if (x + barWidth < 0 || x > W) continue;
			const bh = Math.max(1, Math.round(bar.height * maxBarH));
			ctx.fillRect(x, Math.round((H - bh) / 2), barWidth, bh);
		}

		if (more) rafHandle = requestAnimationFrame(tick);
	}

	$effect(() => {
		const z = zoom;
		const wf = clip.asset?.waveform;
		if (!canvasEl || !containerEl || !wf?.length) return;

		if (!scrollParent) {
			scrollParent = findScrollParent(containerEl);
			const onScroll = () => update();
			scrollParent.addEventListener('scroll', onScroll, { passive: true });
			unlistenScroll = () => scrollParent!.removeEventListener('scroll', onScroll);
		}

		if (!setupDone) {
			setupDone = true;
			prevZoom = z;
			buildAndShow(z);
			return;
		}

		if (z !== prevZoom) {
			prevZoom = z;
			onZoomChange(z);
		}
	});

	let lastHeight = 0;

	const stopWatching = onAnimationFrame(() => {
		if (!containerEl) return;
		if (lastHeight !== containerEl.clientHeight) {
			update(true);
			lastHeight = containerEl.clientHeight;
		}
	}, -4);

	onDestroy(() => {
		if (rafHandle !== null) cancelAnimationFrame(rafHandle);
		if (debounceHandle !== null) clearTimeout(debounceHandle);
		unlistenScroll?.();
		stopWatching();
	});
</script>

{#if inTimeline}
	<div bind:this={containerEl} class="absolute h-full w-full overflow-hidden rounded-sm opacity-50">
		<canvas bind:this={canvasEl} class="pointer-events-none absolute top-0"></canvas>
	</div>
{/if}
<div class="absolute flex h-full w-full items-start overflow-hidden rounded-sm pt-1">
	<span
		class="{!clip.name ? 'italic' : ''} rounded-md bg-popover/50 px-2 text-nowrap whitespace-nowrap"
		// style:margin-left="{scalenum((bounds?.left.seconds ?? 0), 10, 40, 2, 400, false, 'ease-out')}px" <- completely fucking broken lmfao
		style:margin-left="{Math.max(
			bounds?.left.seconds !== undefined ? (bounds?.left.seconds - clip.start) * zoom - 58 : 0,
			4
		)}px"
	>
		{clip.name || clip.asset?.name}
	</span>
</div>
