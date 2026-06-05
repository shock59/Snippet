<script lang="ts">
	import { frameRenderer, getAssetFile, media } from '$lib/media/assets';
	import type { TimelineClip, VideoClip } from '$lib/media/types';
	import { onMount } from 'svelte';

	type Props = { clip: VideoClip; inTimeline?: boolean; zoom?: number; bounds?: ScreenBounds };
	let { clip, inTimeline = false, bounds, zoom = 100 }: Props = $props();

	onMount(async () => {
		const file = await getAssetFile(clip.asset);
		function frameAtStamp(stamp: number) {
			frameRenderer.frame(file, stamp);
		}
	});
</script>

<!-- <div class="flex aspect-square h-full w-auto items-center justify-center">
	<img src={clip.asset?.previewUrl} alt="" class="h-full w-auto rounded-sm" />
</div>
<span class={!clip.name ? 'italic' : ''}>{clip.name ?? clip.asset?.name}</span> -->

<div class="absolute h-full w-full overflow-hidden rounded-sm">
	<div
		style:margin-left="{Math.max(
			bounds !== undefined ? (bounds.leftSeconds - clip.start) * zoom : 0,
			4
		)}px"
		class="flex h-full w-full items-center"
	>
		<div class="flex aspect-square h-full w-auto items-center justify-center py-0.5">
			<img src={clip.asset?.previewUrl} alt="" class="h-full w-auto rounded-sm" />
		</div>
		<span
			class="{!clip.name
				? 'italic'
				: ''} ml-2 rounded-md bg-popover/50 px-2 text-nowrap whitespace-nowrap"
			// style:margin-left="{scalenum((bounds?.left.seconds ?? 0), 10, 40, 2, 400, false, 'ease-out')}px" <- completely fucking broken lmfao
		>
			{clip.name || clip.asset?.name}
		</span>
	</div>
</div>
