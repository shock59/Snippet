<script lang="ts">
	import { scalenum } from '$lib';
	import { frameRenderer, getAssetFile, media } from '$lib/media/assets';
	import type { ImageClip, TimelineClip, VideoClip } from '$lib/media/types';
	import { onMount } from 'svelte';

	type Props = { clip: ImageClip; inTimeline?: boolean; zoom?: number; bounds?: ScreenBounds };
	let { clip, inTimeline = false, bounds, zoom = 100 }: Props = $props();

	onMount(async () => {
		// const file = await getAssetFile(asset);
		// function frameAtStamp(stamp: number) {
		// 	frameRenderer.frame(file, stamp);
		// }
	});
</script>

<div class="absolute h-full w-full overflow-hidden rounded-sm">
	<!-- 
bounds.left.px = 0 : 60px
bounds.left.px = 60 : 0px	
-->
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
		{bounds?.leftSeconds}
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
