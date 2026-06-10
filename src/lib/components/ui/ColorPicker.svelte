<script lang="ts">
	import { mouseX, mouseY, onMouseUp, setCursor } from '$lib/globals';
	import { onAnimationFrame } from '$lib/utils';
	import { clamp } from '@thetally/toolbox';
	import Flex from '../Flex.svelte';
	import { color } from '$lib/color';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';

	type Props = {
		rgb?: {
			r: number;
			g: number;
			b: number;
		};
		hex?: string;
		hsl?: {
			h: number;
			s: number;
			l: number;
		};
		hsv?: {
			h: number;
			s: number;
			v: number;
		};
		opacity?: number;
	};

	let {
		hex = $bindable(),
		hsl: hslProp = $bindable(),
		rgb = $bindable(),
		hsv = $bindable(),
		opacity = $bindable()
	}: Props = $props();
	let hsl = $state(
		hslProp ?? {
			h: 0,
			s: 0,
			l: 0
		}
	);
	if (!hslProp) {
		if (hex) {
			hsl = color.hexToHsl(hex).obj;
		}
		if (rgb) {
			hsl = color.rgbToHsl(rgb).obj;
		}
		if (hsv) {
			hsl = color.hsvToHsl(hsv).obj;
		}
	}

	let internalUpdate = false;

	$effect(() => {
		if (!hex) return;
		if (internalUpdate) return;
		hsl = color.hexToHsl(hex).obj;
	});

	$effect(() => {
		if (!rgb) return;
		if (internalUpdate) return;
		hsl = color.rgbToHsl(rgb).obj;
	});

	$effect(() => {
		if (!hsv) return;
		if (internalUpdate) return;
		hsl = color.hsvToHsl(hsv).obj;
	});

	$effect(() => {
		if (!hslProp) return;
		if (internalUpdate) return;
		hsl = hslProp;
	});

	// svelte-ignore state_referenced_locally
	let sethsl = { ...hsl };

	function updateHSL(v: { h: number; s: number; l: number }) {
		internalUpdate = true;

		hsl = v;
		hslProp = v;
		hex = color.hslToHex(v);
		rgb = color.hslToRgb(v).obj;
		hsv = color.hslToHsv(v).obj;

		queueMicrotask(() => {
			internalUpdate = false;
		});
	}

	let anchor: HTMLDivElement;
	let window: HTMLDivElement;

	let svSlider: null | HTMLDivElement = $state(null);
	let hSlider: null | HTMLDivElement = $state(null);
	let oSlider: null | HTMLDivElement = $state(null);

	let pickerX = $state(0);
	let pickerY = $state(0);
	let pickerWidth = $state(0);
	let pickerHeight = $state(0);
	let pointX = $state(0);
	let pointY = $state(0);
	let pointDragging = $state(false);

	let windowX = $state(0);
	let windowY = $state(0);

	let targetWindowX = $state(0);
	let targetWindowY = $state(0);

	let hueSliderX = $state(0);
	let hueSliderWidth = $state(0);
	let huePointX = $state(0);
	let hueDragging = $state(false);

	let opacitySliderX = $state(0);
	let opacitySliderWidth = $state(0);
	let opacityPointX = $state(0);

	let opacityDragging = $state(false);

	$effect(() => {
		if (!pickerWidth && svSlider) {
			const rect = svSlider.getBoundingClientRect();
			pickerX = rect.x;
			pickerY = rect.y;
			pickerWidth = rect.width;
			pickerHeight = rect.height;
		}

		if (!hueSliderWidth && hSlider) {
			const rect = hSlider.getBoundingClientRect();
			hueSliderX = rect.x;
			hueSliderWidth = rect.width;
		}
		if (!opacitySliderWidth && oSlider) {
			const rect = oSlider.getBoundingClientRect();
			opacitySliderX = rect.x;
			opacitySliderWidth = rect.width;
		}

		if (untrack(() => pointDragging || hueDragging || opacityDragging)) return;

		const hsv = color.hslToHsv(hsl).obj;

		pointX = (hsv.s / 100) * pickerWidth;
		pointY = (1 - hsv.v / 100) * pickerHeight;

		huePointX = (hsl.h / 360) * hueSliderWidth;

		updateHSL(hsl);
		if (opacity !== undefined) {
			opacityPointX = (opacity / 100) * opacitySliderWidth;
		}
	});

	let windowOffsetX = 0;
	let windowOffsetY = 0;

	$effect(() => {
		if (!browser || !anchor || !window) return;

		const stop = onAnimationFrame(() => {
			const anchorRect = anchor.getBoundingClientRect();
			const windowRect = window.getBoundingClientRect();

			const gap = 24;

			const candidates = [
				{
					x: -windowRect.width / 2,
					y: -windowRect.height - gap
				},

				{
					x: -windowRect.width / 2,
					y: gap
				},

				{
					x: gap,
					y: -windowRect.height / 2
				},

				{
					x: -windowRect.width - gap,
					y: -windowRect.height / 2
				},

				{
					x: gap,
					y: gap
				},

				{
					x: -windowRect.width - gap,
					y: gap
				},

				{
					x: gap,
					y: -windowRect.height - gap
				},

				{
					x: -windowRect.width - gap,
					y: -windowRect.height - gap
				}
			];

			function score(x: number, y: number) {
				let s = 0;
				const finalX = anchorRect.left + x;
				const finalY = anchorRect.top + y;

				if (finalX < 0) s += -finalX;
				if (finalY < 0) s += -finalY;

				if (finalX + windowRect.width > innerWidth) {
					s += finalX + windowRect.width - innerWidth;
				}

				if (finalY + windowRect.height > innerHeight) {
					s += finalY + windowRect.height - innerHeight;
				}

				return s;
			}

			let best = candidates[0];
			let bestScore = Infinity;

			for (const candidate of candidates) {
				const s = score(candidate.x, candidate.y);

				if (s < bestScore) {
					bestScore = s;
					best = candidate;

					if (s === 0) break;
				}
			}

			targetWindowX = best.x;
			targetWindowY = best.y;

			windowOffsetX += (targetWindowX - windowOffsetX) * 0.15;
			windowOffsetY += (targetWindowY - windowOffsetY) * 0.15;

			windowX = anchorRect.left + windowOffsetX;
			windowY = anchorRect.top + windowOffsetY;
		});

		return stop;
	});
</script>

<div bind:this={anchor}></div>

<Flex
	class="fixed z-200 w-60 rounded-lg bg-popover p-5 outline"
	style="
	left:{windowX}px;
	top:{windowY}px;
"
	gap={3}
	col
	xCenter
	bind:ref={window}
	vars={{
		h: hsl.h,
		s: hsl.s,
		l: hsl.l
	}}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative aspect-square w-full cursor-cell rounded-sm outline select-none active:cursor-none"
		bind:this={svSlider}
		onmousedown={(e) => {
			const target = e.target as HTMLElement;
			const rect = target.getBoundingClientRect();
			pickerX = rect.x;
			pickerY = rect.y;
			pickerWidth = rect.width;
			pickerHeight = rect.height;
			// pointX = e.offsetX;
			// pointY = e.offsetY;
			pointDragging = true;

			let ease = 0.1;

			let s = 0,
				v = 0;

			const resetCursor = setCursor('crosshair');

			const stop = onAnimationFrame(() => {
				ease += (1 - ease) * 0.1;
				const localX = $mouseX - pickerX;
				const localY = $mouseY - pickerY;
				pointX += (clamp(localX, 0, pickerWidth) - pointX) * ease;
				pointY += (clamp(localY, 0, pickerWidth) - pointY) * ease;

				const news = (pointX / pickerWidth) * 100;
				const newv = (1 - pointY / pickerHeight) * 100;

				if (Math.abs(news - s) > 0.1 || Math.abs(newv - v) > 0.1) {
					s = news;
					v = newv;
					console.log({ s, v });
					updateHSL({
						...color.hsvToHsl(hsl.h, s, v).obj,
						h: hsl.h
					});
				}
				// pointX = clamp(localX, 0, pickerWidth);
				// pointY = clamp(localY, 0, pickerHeight);
			});

			onMouseUp(() => {
				stop();
				resetCursor();
				pointDragging = false;
			});
		}}
	>
		<div class="picker sat rounded-sm"></div>
		<div class="picker luma rounded-sm"></div>

		<div
			style="top: {pointY}px; left: {pointX}px;
		 width: {pointDragging ? '14px' : '8px'};
		 height: {pointDragging ? '14px' : '8px'};
	   background: hsl(var(--h) var(--s) var(--l));
		 transform: translateX(-50%)  translateY({pointDragging ? '-50%' : '-50%'});
		 transition-duration: {pointDragging ? '100ms' : '300ms'};
		"
			class="pointer-events-none absolute cursor-grab rounded-full outline-2 outline-white transition-[width,height,transform]"
		></div>
	</div>

	<div
		class="slider hue relative h-4 w-full rounded-sm outline"
		bind:this={hSlider}
		onmousedown={(e) => {
			const target = e.target as HTMLElement;
			const rect = target.getBoundingClientRect();
			hueSliderX = rect.x;
			hueSliderWidth = rect.width;
			// pointX = e.offsetX;
			// pointY = e.offsetY;
			hueDragging = true;

			let ease = 0.1;

			let h = 0;

			// const resetCursor = setCursor('crosshair');

			const stop = onAnimationFrame(() => {
				ease += (1 - ease) * 0.1;
				const localX = $mouseX - hueSliderX;
				huePointX += (clamp(localX, 0, hueSliderWidth) - huePointX) * ease;

				const newh = (huePointX / hueSliderWidth) * 360;

				if (Math.abs(newh - h) > 0.5) {
					h = newh;
					console.log({ h });
					updateHSL({
						...hsl,
						h
					});
				}
				// pointX = clamp(localX, 0, pickerWidth);
				// pointY = clamp(localY, 0, pickerHeight);
			});

			onMouseUp(() => {
				stop();
				// resetCursor();
				hueDragging = false;
			});
		}}
	>
		<div
			style="top: 0px; left: {huePointX}px;
		 width: {hueDragging ? '4px' : '3px'};
		 height: {hueDragging ? '120%' : '100%'};
	   background: hsl(var(--h) 100 50);
		 transform: translateX(-50%)  translateY({hueDragging ? '-10%' : '0%'});
		 transition-duration: {hueDragging ? '100ms' : '200ms'};
		"
			class="pointer-events-none absolute cursor-grab rounded-xs outline-1 outline-white transition-[width,height,transform]"
		></div>
	</div>

	{#if opacity !== undefined}
		<div
			class="slider opacity-bg h-4 w-full rounded-sm outline"
			bind:this={oSlider}
			onmousedown={(e) => {
				const target = e.target as HTMLElement;
				const rect = target.getBoundingClientRect();
				opacitySliderX = rect.x;
				opacitySliderWidth = rect.width;
				// pointX = e.offsetX;
				// pointY = e.offsetY;
				opacityDragging = true;

				let ease = 0.1;

				let o = 0;

				// const resetCursor = setCursor('crosshair');

				const stop = onAnimationFrame(() => {
					ease += (1 - ease) * 0.1;
					const localX = $mouseX - opacitySliderX;
					opacityPointX += (clamp(localX, 0, opacitySliderWidth) - opacityPointX) * ease;

					const newo = (opacityPointX / opacitySliderWidth) * 100;

					if (Math.abs(newo - o) > 0.5) {
						o = newo;
						console.log({ opacity: o });
						opacity = o;
					}
					// pointX = clamp(localX, 0, pickerWidth);
					// pointY = clamp(localY, 0, pickerHeight);
				});

				onMouseUp(() => {
					stop();
					// resetCursor();
					opacityDragging = false;
				});
			}}
		>
			<div class="slider opacity relative h-full w-full rounded-sm">
				<div
					style="top: 0px; left: {opacityPointX}px;
			 width: {opacityDragging ? '3px' : '2px'};
			 height: {opacityDragging ? '120%' : '100%'};
		   background: hsl(var(--h) calc(var(--s)*{opacity / 100}) var(--l));
			 transform: translateX(-50%)  translateY({opacityDragging ? '-10%' : '0%'});
			 transition-duration: {opacityDragging ? '100ms' : '200ms'};
			"
					class="pointer-events-none absolute cursor-grab rounded-xs outline-1 outline-white transition-[width,height,transform]"
				></div>
			</div>
		</div>
	{/if}

	<Flex row class="flex-wrap" gap={2} xCenter>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
		<div class="h-5 w-5 rounded-sm bg-red-400"></div>
	</Flex>
</Flex>

<style>
	.picker {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.picker.luma {
		background: #000000;
		background: linear-gradient(0deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 100%);
	}
	.picker.sat {
		background: #ffffff;
		background: linear-gradient(90deg, hsl(0 0 100) 0%, hsl(var(--h) 100 50) 100%);
	}

	.slider.hue {
		background: #ffffff;
		background: linear-gradient(
			90deg in hsl longer hue,
			hsl(0, 100%, 50%) 0%,
			hsl(360, 100%, 50%) 100%
		);
	}

	.slider.opacity {
		background: #ffffff;
		background: linear-gradient(90deg, transparent 2%, hsl(var(--h) var(--s) var(--l)) 98%);
	}
	.slider.opacity-bg {
		background-color: #5d5d5d;
		background-image: conic-gradient(
			#434343 90deg,
			transparent 90deg 180deg,
			#434343 180deg 270deg,
			transparent 270deg
		);
		background-size: 16px 16px; /* Size of two squares together */
	}
</style>
