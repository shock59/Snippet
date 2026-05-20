<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import { onAnimationFrame } from '$lib/utils';
	import { onDestroy, settled } from 'svelte';
	import { slide } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import { Play, Pause } from '@lucide/svelte';
	/**
	 * zoom= px per second
	 */
	let zoom = $state(500);

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

	let timelineContainer: HTMLDivElement;
	const playheadSettledOffset = 250;
	let playheadSettled = $state(false);
	let playheadSettledV = $state(0);
	let playheadLeft = $state(0);

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

	const headDistanceHistory: number[] = [];
	const headSettledHistory: number[] = [];

	let timelineContainerScrollLeft = $state(0);
	let timelineContainerWidth = $state(0);

	function frame(dt?: number) {
		if (!timelineContainer) return;
		if (playing) if (dt) currentTimestamp += dt / 1000;

		const left = timelineContainer.scrollLeft;
		const width = timelineContainer.clientWidth;
		const contentWidth = timelineContainer.firstElementChild?.clientWidth ?? width;

		const leftSeconds = Math.max(0, left / zoom);
		const rightSeconds = Math.min((left + width) / zoom, contentWidth / zoom);

		if (rightSeconds <= leftSeconds) return;

		const { step: minorScale, lastStep: hiddenScale } = chooseMinorScale(zoom);
		// console.log({minorScale, hiddenScale})
		const minorPx = minorScale * zoom;

		const majorDivision = chooseMajorDivision(minorPx);

		const majorScale = minorScale * majorDivision;

		const startIndex = Math.floor(leftSeconds / hiddenScale) - 1;
		const endIndex = Math.ceil(rightSeconds / hiddenScale) + 1;

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
			// if (!major && !minor ) console.log("SMALL")
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

		if (playing) {
			const headVisible = currentTimestamp > leftSeconds && currentTimestamp < rightSeconds;
			if (headVisible) {
				const headLeft = currentTimestamp * zoom;
				// const desiredScrollLeft = Math.max(0, headLeft - width + playheadSettledOffset);
				// const delta = desiredScrollLeft - left;
				// const followFactor = 0.22;
				// const minStep = 1;
				// const maxStep = 24;
				// const scrollStep =
				// 	Math.sign(delta) * Math.min(Math.max(minStep, Math.abs(delta) * followFactor), maxStep);

				const offset = zoom / 50 + 15 - ((rightSeconds - currentTimestamp) * zoom) / 20;
				if (offset > 0) timelineContainer.scrollLeft += offset;

				// if (scrollStep > 0) {
				// 	timelineContainer.scrollLeft = left + scrollStep;
				// 	timelineContainerScrollLeft = timelineContainer.scrollLeft;
				// }
				timelineContainerWidth = timelineContainer.clientWidth;

				const headDistance = left + width - headLeft;
				headDistanceHistory.push(headDistance);
				while (headDistanceHistory.length > 42) headDistanceHistory.shift();
				const minHist = Math.min(...headDistanceHistory);
				const maxHist = Math.max(...headDistanceHistory);

				// dont know why 60 works well here, when in js its better to not ask questions.

				playheadSettled = maxHist - minHist <= 10 && headDistanceHistory.length >= 4;

				if (playheadSettled) {
					headSettledHistory.push(headDistance);
					while (headSettledHistory.length > 200) headSettledHistory.shift();
					playheadSettledV =
						headSettledHistory.reduce((p, c) => p + c, 0) / headSettledHistory.length + zoom / 60;
				} else {
					headSettledHistory.length = 0;
				}
			} else {
				playheadSettled = false;
			}
		} else {
			playheadSettled = false;
		}
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
		if (!e.ctrlKey) return;
		e.preventDefault();

		const oldZoom = zoom;
		const direction = e.deltaY > 0 ? -0.5 : 0.5;
		const zoomFactor = 1.1 ** direction;
		const newZoom = Math.max(1, Math.min(1000, zoom * zoomFactor));

		const rect = timelineContainer.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const cursorTimestamp = (timelineContainer.scrollLeft + mouseX) / oldZoom;

		zoom = Math.round(newZoom);

		const newScrollLeft = cursorTimestamp * newZoom - mouseX;
		timelineContainer.scrollLeft = newScrollLeft;
	}

	const recalcTicksStop = onAnimationFrame(frame);
	onDestroy(recalcTicksStop);
</script>

<div id="app" class="absolute top-0 left-0 flex h-screen w-screen flex-col overflow-hidden">
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
							</Button>{playheadSettled}
						</div>
					</div>
				</Resizable.Pane>
				<Resizable.Handle />
				<Resizable.Pane>idk what goes here {ticks.length} {zoom}<br /></Resizable.Pane>
			</Resizable.PaneGroup>
		</Resizable.Pane>
		<Resizable.Handle />
		<Resizable.Pane defaultSize={35} class="relative">
			<div
				class=" flex h-full w-full flex-col overflow-scroll"
				bind:this={timelineContainer}
				onwheel={handleWheel}
			>
				<div class="relative h-full" style="width: {length * zoom}px;">
					<div class="h-4 bg-muted">
						{#each ticks as tick (tick.stamp)}
							<div
								class={`
												absolute top-0 -translate-x-1/2 bg-foreground
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
				{@render playhead(timelineContainerWidth - playheadSettledV, playheadSettled ? 100 : 0)}
			</div>
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>

{#snippet playhead(left: number, opacity = 100)}
	<playhead
		class="absolute top-0 z-20 flex h-full w-6 -translate-x-1/2 flex-col items-center"
		// style={`left:${timelineContainer.scrollLeft * zoom}px;`}

		style={`left:${left}px; opacity: ${opacity}%`}
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
	</playhead>{/snippet}
