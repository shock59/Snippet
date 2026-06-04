<script lang="ts">
	import ObjViewer from '$lib/components/ObjViewer.svelte';
	import { mouseX, mouseY, onMouseUp } from '$lib/globals';
	import { pressedKeys } from '$lib/kbd';
	import { clipType, type MediaAsset } from '$lib/media/types';
	import { onAnimationFrame } from '$lib/utils';
	import Audio from './Audio.svelte';
	import Video from './Video.svelte';
	import type { ClipTransform, VisibleClip } from './visibleClips';

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

	const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

	function startResize(e: MouseEvent, handle: string) {
		e.stopPropagation();

		if (!vis.clip.asset) return;
		const assetWidth = vis.clip.asset.width;
		const assetHeight = vis.clip.asset.height;
		if (!assetWidth || !assetHeight) return;

		const startWidth = vis.transform.width ?? assetWidth;
		const startHeight = vis.transform.height ?? assetHeight;
		const startLeft = vis.transform.x;
		const startTop = vis.transform.y;

		const aspectRatio = startWidth / startHeight;

		const startMouseX = $mouseX;
		const startMouseY = $mouseY;

		const isMediaClip = vis.clip.type === clipType.image || vis.clip.type === clipType.video;

		const stop = onAnimationFrame(() => {
			const dx = ($mouseX - startMouseX) / xScale;
			const dy = ($mouseY - startMouseY) / yScale;

			const fromCenter = $pressedKeys.has('ctrl');
			const lockAspectRatio = isMediaClip ? !$pressedKeys.has('shift') : $pressedKeys.has('shift');

			let nextWidth = startWidth;
			let nextHeight = startHeight;

			if (handle.includes('e')) nextWidth = startWidth + (fromCenter ? 2 * dx : dx);
			if (handle.includes('w')) nextWidth = startWidth - (fromCenter ? 2 * dx : dx);
			if (handle.includes('s')) nextHeight = startHeight + (fromCenter ? 2 * dy : dy);
			if (handle.includes('n')) nextHeight = startHeight - (fromCenter ? 2 * dy : dy);

			nextWidth = Math.max(10, nextWidth);
			nextHeight = Math.max(10, nextHeight);

			if (lockAspectRatio) {
				if (handle === 'e' || handle === 'w') {
					nextHeight = nextWidth / aspectRatio;
				} else if (handle === 'n' || handle === 's') {
					nextWidth = nextHeight * aspectRatio;
				} else {
					const relW = Math.abs(nextWidth / startWidth - 1);
					const relH = Math.abs(nextHeight / startHeight - 1);
					if (relW >= relH) {
						nextHeight = nextWidth / aspectRatio;
					} else {
						nextWidth = nextHeight * aspectRatio;
					}
				}
			}

			let nextX: number;
			let nextY: number;

			if (fromCenter) {
				nextX = startLeft + (startWidth - nextWidth) / 2;
				nextY = startTop + (startHeight - nextHeight) / 2;
			} else if (lockAspectRatio && (handle === 'e' || handle === 'w')) {
				nextX = handle === 'w' ? startLeft + startWidth - nextWidth : startLeft;
				nextY = startTop + (startHeight - nextHeight) / 2;
			} else if (lockAspectRatio && (handle === 'n' || handle === 's')) {
				nextX = startLeft + (startWidth - nextWidth) / 2;
				nextY = handle === 'n' ? startTop + startHeight - nextHeight : startTop;
			} else {
				const rightFixed = handle.includes('w');
				const bottomFixed = handle.includes('n');
				nextX = rightFixed ? startLeft + startWidth - nextWidth : startLeft;
				nextY = bottomFixed ? startTop + startHeight - nextHeight : startTop;
			}

			updateTransform(vis.clip.id, {
				...vis.transform,
				x: nextX,
				y: nextY,
				width: nextWidth,
				height: nextHeight
			});
		});

		onMouseUp(stop);
	}

	type Props = {
		vis: VisibleClip;
		updateTransform: (id: string, transform: ClipTransform) => void;
		playing: boolean;
		currentTimestamp: number;
		previewDimensions: Dimensions;
		canvasDimensions: Dimensions;
		highlightedClip: string;
	};

	let {
		vis,
		updateTransform,
		currentTimestamp,
		playing,
		canvasDimensions,
		previewDimensions,
		highlightedClip = $bindable('')
	}: Props = $props();

	const xScale = $derived(previewDimensions.width / canvasDimensions.width);
	const yScale = $derived(previewDimensions.height / canvasDimensions.height);

	function getTransformStyles(transform: ClipTransform, asset: MediaAsset) {
		const styles: string[] = ['position: absolute;'];

		const w = transform.width ?? asset.width;
		const h = transform.height ?? asset.height;

		if (!w || !h) return '';

		styles.push(`top: ${transform.y * yScale}px;`);
		styles.push(`left: ${transform.x * xScale}px;`);
		styles.push(`width: ${w * xScale}px;`);
		styles.push(`height: ${h * yScale}px;`);
		styles.push(`rotate: ${transform.rotation}deg;`);
		styles.push(`opacity: ${transform.opacity * 100}%;`);
		styles.push(`transform-origin: ${transform.anchorX * 100}% ${transform.anchorY * 100}%;`);
		return styles.join(' ');
	}
</script>

{#if vis.clip.type === clipType.audio}
	{#if vis.url}
		<Audio
			src={vis.url}
			isPlaying={playing}
			time={vis.mediaTime}
		/>
	{/if}
{:else if vis.clip.asset}
	<div class="pointer-events-none absolute top-0 left-0 h-full w-full overflow-hidden">
		<button
			style={getTransformStyles(vis.transform, vis.clip.asset)}
			class="pointer-events-auto"
			onclick={() => {
				highlightedClip = vis.clip.id;
			}}
		>
			{#if vis.clip.type === clipType.image}
				<img src={vis.url} alt="" class="h-full w-full" />
			{:else if vis.clip.type === clipType.video}
				{#if vis.url}
					<!-- <div class="absolute top-0 left-0">	
							<ObjViewer
								object={{
									playing,
									url: vis.url,
									currentTimestamp,
									time: vis.mediaTime
								}}
							/>
						</div> -->
					<Video
						src={vis.url}
						isPlaying={playing}
						time={vis.mediaTime}
						class="h-full w-full object-fill"
					/>
				{/if}
			{/if}
		</button>
	</div>
	<!-- svelte-ignore a11y_consider_explicit_label -->
	{#if highlightedClip === vis.clip.id}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onmousedown={(e) => {
				e.stopPropagation();

				const startX = vis.transform.x;
				const startY = vis.transform.y;

				const startMouseX = $mouseX;
				const startMouseY = $mouseY;

				const stopDrag = onAnimationFrame(() => {
					const diffX = ($mouseX - startMouseX) / xScale;
					const diffY = ($mouseY - startMouseY) / yScale;

					updateTransform(vis.clip.id, { ...vis.transform, x: startX + diffX, y: startY + diffY });
				});
				onMouseUp(stopDrag);
			}}
			class="pointer-events-auto z-50 cursor-grab bg-playhead/5 outline-4 outline-playhead outline-dashed active:cursor-grabbing"
			style={getTransformStyles(vis.transform, vis.clip.asset)}
		>
			{#each handles as handle}
				<div
					role="button"
					tabindex={0}
					class="resize-handle {handle}"
					onmousedown={(e) => startResize(e, handle)}
				></div>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.resize-handle {
		position: absolute;
		--edge-handle-size: 6px;
		--edge-handle-offset: -5px;
		--corner-handle-size: 12px;
		--corner-handle-offset: -8px;
		--corner-handle-radius: 4px;
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
		background-color: var(--color-snippet-lavender);
		border-radius: var(--corner-handle-radius);
	}
	.resize-handle.nw {
		top: var(--corner-handle-offset);
		left: var(--corner-handle-offset);
		width: var(--corner-handle-size);
		height: var(--corner-handle-size);
		cursor: nw-resize;
		background-color: var(--color-snippet-lavender);
		border-radius: var(--corner-handle-radius);
	}
	.resize-handle.se {
		bottom: var(--corner-handle-offset);
		right: var(--corner-handle-offset);
		width: var(--corner-handle-size);
		height: var(--corner-handle-size);
		cursor: se-resize;
		background-color: var(--color-snippet-lavender);
		border-radius: var(--corner-handle-radius);
	}
	.resize-handle.sw {
		left: var(--corner-handle-offset);
		bottom: var(--corner-handle-offset);
		width: var(--corner-handle-size);
		height: var(--corner-handle-size);
		cursor: sw-resize;
		background-color: var(--color-snippet-lavender);
		border-radius: var(--corner-handle-radius);
	}
</style>
