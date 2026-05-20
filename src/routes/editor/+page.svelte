<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import { onAnimationFrame } from '$lib/utils';
	import { onDestroy, settled } from 'svelte';
	import { slide } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import { Play, Pause, Square } from '@lucide/svelte';
	/**
	 * zoom= px per second
	 */
	let zoom = $state(500);

	type flat<t> = { [k in keyof t]: t[k] } & {};

	type EnumFromArgs<T extends string[]> = {
		[K in keyof T as T[K] extends string ? T[K] : never]: K extends `${infer N extends number}`
			? N
			: never;
	};

	function Enum<T extends string[]>(...args: T): flat<EnumFromArgs<T>> {
		return Object.fromEntries(args.map((arg, i) => [arg, i])) as flat<EnumFromArgs<T>>;
	}

	const clipType = Enum('video', 'text', 'audio', 'image', 'solid');
	type ClipType = typeof clipType;

	type Values<T> = T[keyof T];
	interface BaseClip {
		id: string;

		type: Values<ClipType>;

		sourceId?: string;

		start: number;
		duration: number;

		offset: number;

		layer?: number;

		name?: string;
		color?: string;

		locked?: boolean;
		hidden?: boolean;

		muted?: boolean;

		selected?: boolean;

		transform?: {
			x: number;
			y: number;

			scaleX: number;
			scaleY: number;

			rotation: number;

			opacity: number;

			anchorX: number;
			anchorY: number;
		};
	}

	interface VideoClip extends BaseClip {
		type: ClipType['video'];
		playbackRate?: number;

		reverse?: boolean;

		audioLinked?: string;
	}
	interface TextClip extends BaseClip {
		type: ClipType['text'];

		text: string;

		fontFamily?: string;
		fontSize?: number;

		fontWeight?: number;

		align?: 'left' | 'center' | 'right';

		color?: string;

		strokeColor?: string;
		strokeWidth?: number;
	}

	interface AudioClip extends BaseClip {
		type: ClipType['audio'];
		gain?: number;

		pan?: number;

		speed?: number;
	}
	interface ImageClip extends BaseClip {
		type: ClipType['image'];
		objectFit?: 'contain' | 'cover' | 'stretch';

		duration: number;
	}
	interface TextClip extends BaseClip {
		type: ClipType['text'];
	}
	interface SolidClip extends BaseClip {
		type: ClipType['solid'];

		color: string;
	}

	type TimelineClip = VideoClip | AudioClip | ImageClip | TextClip | SolidClip;

	interface MediaSource {
		id: string;

		type: 'video' | 'audio' | 'image' | 'subtitle';

		name: string;

		duration?: number;

		width?: number;
		height?: number;

		frameRate?: number;
		sampleRate?: number;

		src: string;
	}

	let currentTimestamp = $state(0);
	let speed = 1;
	let playing = $state(false);

	// let frameLoopStop: ReturnType<typeof onAnimationFrame> | null = $state(null);
	function play() {
		// frameLoopStop = onAnimationFrame((dt) => {
		// 	console.log(dt);
		// 	if (dt) currentTimestamp += dt / 1000;
		// });
		playing = true;
	}

	function stop() {
		// frameLoopStop?.();
		// frameLoopStop = null;
		playing = false;
	}

	let length = $state(60 * 5);

	type Tick = {
		stamp: number;
		showStamp?: boolean;
		state: 'major' | 'intermediate' | 'minor' | 'hidden';
	};

	let ticks: Tick[] = $state([]);
	const tickMap = new Map<number, Tick>();
	let tickState = $state({
		startIndex: 0,
		endIndex: 0,
		hiddenScale: 0,
		majorScale: 0,
		minorScale: 0
	});

	let timelineContainer: HTMLDivElement;
	let playheadLeft = $state(0);
	let playheadDragged = $state(false);

	let followStrength = 0;
	let targetScrollLeft = 0;

	const FollowDelay = 400;
	const FollowSmoothing = 14;
	const PlayheadScreenOffset = 0.72;

	let mouseX = $state(0);
	let mouseY = $state(0);

	// const baseSteps = [0.25,
	// 0.5,
	// 1,
	// 2,
	// 5,
	// 10,
	// 15,
	// 30,
	// 60,
	// 120,
	// 300,
	// 600,
	// 1200,
	// 2400];
	const baseSteps = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32, 64, 128];

	function chooseMinorScale(pxPerSecond: number) {
		const targetMinorPx = 20;

		let lastStep = baseSteps[0];

		for (const step of baseSteps) {
			if (step * pxPerSecond >= targetMinorPx) {
				return { step, lastStep };
			}
			lastStep = step;
		}

		return { step: baseSteps[baseSteps.length - 2], lastStep: baseSteps[baseSteps.length - 1] };
	}

	function chooseMajorDivision(minorPx: number) {
		const candidates = [1, 2, 4, 6, 8, 12, 16];

		let best = candidates[0];
		let bestDiff = Infinity;

		for (const div of candidates) {
			const px = minorPx * div;
			const diff = Math.abs(px - 80);

			if (diff < bestDiff) {
				best = div;
				bestDiff = diff;
			}
		}

		return best;
	}
	function curveZoomDelta(deltaY: number) {
		const sensitivity = 0.002;

		const zoomFactor = deltaY * zoom * sensitivity;

		return Math.sign(deltaY) * Math.pow(Math.abs(zoomFactor), 0.95);
	}

	let timelineContainerWidth = $state(0);

	let userScrolling = $state(false);
	let lastUserScrollTime = 0;

	let lastLeft = 0;

	function frame(dt?: number) {
		if (!timelineContainer) return;

		const scrollLeft = timelineContainer.scrollLeft;
		const width = timelineContainer.clientWidth;
		const rect = timelineContainer.getBoundingClientRect();
		const contentWidth = timelineContainer.firstElementChild?.clientWidth ?? width;
		const leftSeconds = Math.max(0, scrollLeft / zoom);
		const rightSeconds = Math.min((scrollLeft + width) / zoom, contentWidth / zoom);

		if (rightSeconds <= leftSeconds) return;

		const dtSeconds = dt ? dt / 1000 : 1 / 60;
		updateFollowState(width, dtSeconds);

		updateTicks(leftSeconds, rightSeconds);
		updateUserScrollState();

		if (playheadDragged) {
			handlePlayheadDrag(rect, width, dtSeconds);
		}

		if (playing && dt) {
			currentTimestamp += (dt / 1000) * speed;
		}

		timelineContainerWidth = width;
		playheadLeft = currentTimestamp * zoom - timelineContainer.scrollLeft;
	}

	function updateTicks(leftSeconds: number, rightSeconds: number) {
		const { step: minorScale, lastStep: hiddenScale } = chooseMinorScale(zoom);
		const majorDivision = chooseMajorDivision(minorScale * zoom);
		const majorScale = minorScale * majorDivision;
		const startIndex = Math.floor(leftSeconds / hiddenScale) - 1;
		const endIndex = Math.ceil(rightSeconds / hiddenScale) + 1;

		const needsRecalc =
			startIndex !== tickState.startIndex ||
			endIndex !== tickState.endIndex ||
			hiddenScale !== tickState.hiddenScale ||
			majorScale !== tickState.majorScale ||
			minorScale !== tickState.minorScale;

		if (!needsRecalc) return;

		tickState = {
			startIndex,
			endIndex,
			hiddenScale,
			majorScale,
			minorScale
		};

		const visible = new Set<number>();

		for (let i = startIndex; i <= endIndex; i++) {
			const stamp = Number((i * hiddenScale).toFixed(6));
			visible.add(stamp);

			const major =
				Math.round(stamp / majorScale) * majorScale === stamp && Math.round(stamp) === stamp;
			const intermediate =
				!major && Math.round(stamp / (minorScale * 4)) === stamp / (minorScale * 4);
			const minor = Math.round(stamp / minorScale) * minorScale === stamp;

			let tick = tickMap.get(stamp);
			if (!tick) {
				tick = {
					stamp,
					state: major ? 'major' : intermediate ? 'intermediate' : minor ? 'minor' : 'hidden',
					showStamp: intermediate || major
				};
				tickMap.set(stamp, tick);
			} else {
				tick.state = major ? 'major' : intermediate ? 'intermediate' : minor ? 'minor' : 'hidden';
				tick.showStamp = intermediate || major;
			}
		}

		for (const [stamp] of tickMap) {
			if (!visible.has(stamp)) {
				tickMap.delete(stamp);
			}
		}

		ticks = Array.from(tickMap.values()).sort((a, b) => a.stamp - b.stamp);
	}

	function updateUserScrollState() {
		const now = performance.now();
		if (now - lastUserScrollTime > 150) {
			userScrolling = false;
		}
	}

	function handlePlayheadDrag(rect: DOMRect, width: number, dtSeconds: number) {
		const edgeSize = 120;
		const maxSpeed = 1600;
		const localMouseX = mouseX - rect.left;
		let velocity = 0;

		if (localMouseX > width - edgeSize) {
			const t = (localMouseX - (width - edgeSize)) / edgeSize;
			velocity = t * maxSpeed;
		} else if (localMouseX < edgeSize) {
			const t = (edgeSize - localMouseX) / edgeSize;
			velocity = -t * maxSpeed;
		}

		timelineContainer.scrollLeft += velocity * dtSeconds;
		currentTimestamp = (localMouseX + timelineContainer.scrollLeft) / zoom;
	}

	function updateFollowState(width: number, dtSeconds: number) {
		const maxScrollLeft = timelineContainer.scrollWidth - width;
		const playheadWorldX = currentTimestamp * zoom;
		const desiredScreenX = width * PlayheadScreenOffset;
		const desiredScrollLeft = playheadWorldX - desiredScreenX;
		const now = performance.now();
		const shouldFollow = playing && !playheadDragged && now - lastUserScrollTime > FollowDelay;

		followStrength = smoothDamp(followStrength, shouldFollow ? 1 : 0, dtSeconds, 10);
		targetScrollLeft = smoothDamp(targetScrollLeft, desiredScrollLeft, dtSeconds, FollowSmoothing);
		targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetScrollLeft));

		if (followStrength > 0.001) {
			const current = timelineContainer.scrollLeft;
			lastLeft = current;
			timelineContainer.scrollLeft = smoothDamp(
				current,
				targetScrollLeft,
				dtSeconds,
				20 * followStrength
			);
		}
	}

	function smoothDamp(current: number, target: number, dt: number, speed: number) {
		return current + (target - current) * (1 - Math.exp(-speed * dt));
	}

	const subMap = {
		[1 / 4]: '1/4',
		[1 / 2]: '1/2',
		[3 / 4]: '3/4',
		[1 / 8]: '1/8',
		[3 / 8]: '3/8',
		[5 / 8]: '5/8',
		[7 / 8]: '7/8'
	};

	function formatTimestamp(seconds: number) {
		//why the fuck this wouldprobably nuke your computer lmao
		if (Math.round(seconds) !== seconds) {
			const sub = seconds - Math.floor(seconds);
			return subMap[sub].toString();
		}

		const days = Math.floor(seconds / 60 / 60 / 24) % 60;

		const hours = Math.floor(seconds / 60 / 60) % 24;
		const mins = Math.floor(seconds / 60) % 60;
		const secs = Math.round((seconds % 60) * 4) / 4;

		return `${days ? `${days}d ` : ''} ${hours ? `${hours}:` : ''}${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey) {
			e.preventDefault();
			console.log('zoom');

			const oldZoom = zoom;
			const direction = e.deltaY > 0 ? -0.5 : 0.5;
			const zoomFactor = 1.1 ** direction;
			const newZoom = Math.max(1, Math.min(1000, zoom * zoomFactor));

			const rect = timelineContainer.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const cursorTimestamp = (timelineContainer.scrollLeft + mouseX) / oldZoom;

			zoom = newZoom;
			const newScrollLeft = cursorTimestamp * newZoom - mouseX;
			timelineContainer.scrollLeft = newScrollLeft;
			targetScrollLeft = timelineContainer.scrollLeft;
		} else {
			lastUserScrollTime = performance.now();
			userScrolling = true;
		}
	}

	const recalcTicksStop = onAnimationFrame(frame);
	onDestroy(recalcTicksStop);

	const mouseUpCallbacks: (() => void)[] = [];
	function onMouseUp(cb: () => void) {
		mouseUpCallbacks.push(cb);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	id="app"
	class="absolute top-0 left-0 flex h-screen w-screen flex-col overflow-hidden"
	onmouseup={() => {
		while (mouseUpCallbacks.length) {
			mouseUpCallbacks.pop()?.();
		}
	}}
	onmousemove={(e) => {
		mouseX = e.clientX;
		mouseY = e.clientY;
	}}
>
	<Resizable.PaneGroup direction="vertical">
		<Resizable.Pane>
			<Resizable.PaneGroup direction="horizontal">
				<Resizable.Pane defaultSize={60}>
					<div class="relative h-full w-full">
						<div class="absolute bottom-0 left-0 w-full">
							<Button
								size="icon"
								onclick={() => {
									if (playing) stop();
									else play();
								}}
							>
								{#if playing}
									<Pause />
								{:else}
									<Play />
								{/if}
							</Button>
						</div>
					</div>
				</Resizable.Pane>
				<Resizable.Handle />
				<Resizable.Pane
					>idk what goes here <pre>{JSON.stringify(
							{
								zoom,
								userScrolling,
								playheadDragged,
								playheadLeft,
								mouseX,
								mouseY,
								tickState,
								currentTimestamp
							},
							null,
							2
						)}
					</pre></Resizable.Pane
				>
			</Resizable.PaneGroup>
		</Resizable.Pane>
		<Resizable.Handle />
		<Resizable.Pane defaultSize={35} class="relative">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class=" flex h-full w-full flex-col overflow-scroll"
				bind:this={timelineContainer}
				onwheel={handleWheel}
			>
				<div class="relative h-full" style="width: {length * zoom}px;">
					<div
						class="h-4 cursor-move bg-muted"
						onmousedown={() => {
							let lastMouseX = mouseX;
							let lastMouseY = mouseY;
							let targetScrollLeft = timelineContainer.scrollLeft;
							let targetZoom = zoom;
							const stop = onAnimationFrame(() => {
								const deltaX = lastMouseX - mouseX;
								const deltaY = lastMouseY - mouseY;
								const absDeltaX = Math.abs(deltaX);
								const absDeltaY = Math.abs(deltaY);
								const dominantThreshold = 6;
								const scrollDominant = absDeltaX > absDeltaY * dominantThreshold;
								const zoomDominant = absDeltaY > absDeltaX * dominantThreshold;

								targetScrollLeft += deltaX;
								timelineContainer.scrollLeft = targetScrollLeft;
								lastMouseX = mouseX;

								if (zoomDominant || (!scrollDominant && !zoomDominant && absDeltaY > 0)) {
									const oldZoom = zoom;
									targetZoom = targetZoom + curveZoomDelta(deltaY);
									zoom = Math.max(1, Math.min(1000, targetZoom));
									// const direction = deltaY > 0 ? -1 : 1;
									// const zoomFactor = 1.1 ** direction;
									// const newZoom = Math.max(1, Math.min(1000, zoom * zoomFactor));

									const cursorTimestamp = (timelineContainer.scrollLeft + mouseX) / oldZoom;

									// zoom = Math.round(newZoom);
									const newScrollLeft = cursorTimestamp * zoom - mouseX;
									timelineContainer.scrollLeft = newScrollLeft;
									targetScrollLeft = newScrollLeft;
									lastMouseY = mouseY;
								}
							}, -100);
							onMouseUp(() => {
								stop();
							});
						}}
					>
						{#each ticks as tick (tick.stamp)}
							<div
								class={`
												pointer-events-none absolute top-0 -translate-x-1/2 bg-foreground select-none
												${tick.state === 'major' ? 'h-4 w-px opacity-100' : tick.state === 'intermediate' ? 'h-3 w-px opacity-85' : tick.state === 'minor' ? 'h-2 w-px opacity-50' : 'h-0 w-px opacity-0'}
											`}
								style={`left:${tick.stamp * zoom}px;` +
									'transition: height 250ms ease-in-out, opacity 250ms ease-in-out;'}
							>
								{#if tick.showStamp}
									<div
										class="absolute top-0 left-1 z-10 bg-muted text-xs whitespace-nowrap opacity-80"
										transition:slide={{ axis: 'x' }}
									>
										{formatTimestamp(tick.stamp)}
									</div>
								{/if}
							</div>
						{/each}
					</div>
					<!-- {@render playhead(currentTimestamp * zoom, !playheadSettled ? 100 : 0)} -->
				</div>
				<playhead
					role="button"
					tabindex="0"
					class=" absolute top-0 z-20 flex w-1 -translate-x-1/2 cursor-ew-resize flex-col items-center"
					onmousedown={() => {
						stop();
						playheadDragged = true;
						onMouseUp(() => {
							playheadDragged = false;
						});
					}}
					// style={`left:${timelineContainer.scrollLeft * zoom}px;`}

					style={`left:${playheadLeft}px; opacity: ${playheadDragged ? 45 : 100}%; transform: translateY(${playheadDragged ? -10 : 0}px); transition: opacity 100ms ease-out, transform 100ms ease-out; height: calc(100% + 15px);`}
					onwheel={(e: any) => {
						e.preventDefault();

						if (e.ctrlKey) {
							handleWheel(e);
							return;
						}

						timelineContainer.scrollLeft += e.deltaY + e.deltaX;

						lastUserScrollTime = performance.now();
						userScrolling = true;
					}}
					// style={`left:6px;`}
				>
					<!-- <svg class="h-4 w-3" viewBox="0 0 6 8" xmlns="http://www.w3.org/2000/svg">
								<polygon points="3,8 6,5 6,0 0,0 0,5" fill="var(--primary)" />
							</svg> -->
					<svg class="h-4 w-3" viewBox="0 0 8 12" fill="none" xmlns="http://www.w3.org/2000/svg">
						<g>
							<path
								d="M4 12C4 12 8 9.5 8 8.00001V4.00001V2.00001V1.00001C8 0.45 7.55 1.01175e-05 7 1.01175e-05C6.60948 0.000422135 6 1.01175e-05 6 1.01175e-05H4H2H1C0.45 1.19406e-05 0 0.45 0 1.00001V2.00001V4.00001V8.00001C0 9.5 4 12 4 12Z"
								fill="var(--primary)"
							/>
						</g>
					</svg>
					<div class="-mt-2 h-full w-px -translate-x-1/4 bg-primary/50"></div>
				</playhead>
				<!-- {@render playhead(playheadLeft, playheadSettled ? 100 : 100)} -->
			</div>
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>
