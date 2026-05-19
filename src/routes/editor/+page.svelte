<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import { onAnimationFrame } from '$lib/utils';
	import { onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';

	/**
	 * zoom= px per second
	 */
	let zoom = $state(67);
	let playhead = $state(0);
	let length = $state(60 * 60 * 25);

	type Tick = {
		stamp: number;
		showStamp?: boolean;
		state: 'major' | 'intermediate' | 'minor' | 'hidden';
	};

	let ticks: Tick[] = $state([]);
	const tickMap = new Map<number, Tick>();

	let timelineContainer: HTMLDivElement;

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

	function recalcTicks() {
		if (!timelineContainer) return;

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

			console.log(minorScale);

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

		zoom = newZoom;

		const newScrollLeft = cursorTimestamp * newZoom - mouseX;
		timelineContainer.scrollLeft = newScrollLeft;
	}

	const stop = onAnimationFrame(recalcTicks);
	onDestroy(stop);
</script>

<div id="app" class="absolute top-0 left-0 flex h-screen w-screen flex-col overflow-hidden">
	<Resizable.PaneGroup direction="vertical">
		<Resizable.Pane>
			<Resizable.PaneGroup direction="horizontal">
				<Resizable.Pane defaultSize={60}>preview</Resizable.Pane>
				<Resizable.Handle />
				<Resizable.Pane>idk what goes here {ticks.length}<br /></Resizable.Pane>
			</Resizable.PaneGroup>
		</Resizable.Pane>
		<Resizable.Handle />
		<Resizable.Pane defaultSize={35}>
			<div
				class="flex h-auto min-h-full w-full flex-col overflow-scroll"
				bind:this={timelineContainer}
				onwheel={handleWheel}
			>
				<div class="relative h-4 bg-muted" style="width: {length * zoom}px;">
					{#each ticks as tick (tick.stamp)}
						<div
							class={`
											absolute top-0 bg-foreground
											${tick.state === 'major' ? 'h-4 w-px opacity-100' : tick.state === 'intermediate' ? 'h-3 w-px opacity-85' : tick.state === 'minor' ? 'h-2 w-px opacity-50' : 'h-0 w-px opacity-0'}
										`}
							style={`left:${tick.stamp * zoom}px;` +
								'transition: height 250ms ease-in-out, opacity 250ms ease-in-out;'}
						>
							{#if tick.showStamp}
								<div
									class="absolute top-0 left-1 bg-muted text-xs whitespace-nowrap opacity-80 z-10"
									transition:slide={{ axis: 'x' }}
								>
									{formatTimestamp(tick.stamp)}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>
