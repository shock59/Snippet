<script lang="ts">
	import { frameRenderer, getAssetFile, media } from '$lib/media/assets';
	import { clipType, type TimelineClip } from '$lib/media/types';
	import AudioClip from './clips/AudioClip.svelte';
	import ImageClip from './clips/ImageClip.svelte';
	import VideoClip from './clips/VideoClip.svelte';

	type Props = { clip: TimelineClip; inTimeline?: boolean; zoom?: number; bounds?: ClipBounds };
	let { clip, inTimeline = false, zoom, bounds }: Props = $props();
</script>

<div
	class="pointer-events-none flex h-full w-full flex-row items-center gap-2 rounded-md bg-pink-600 select-none"
	style="
  filter: drop-shadow(0px 0px 2px var(--background));
  "
>
	{clip.start}
	{inTimeline}
	{#if clip.type === clipType.image}
		<!-- <div class="flex aspect-square h-full w-auto items-center justify-center">
			<img src={asset?.previewUrl} alt="" class="h-full w-auto rounded-sm" />
		</div>
		<span class={!clip.name ? 'italic' : ''}>{clip.name ?? asset?.name}</span> -->
		<ImageClip {clip} {inTimeline} {zoom} {bounds} />
	{:else if clip.type === clipType.video}
		<VideoClip {clip} {inTimeline} />
	{:else if clip.type === clipType.audio}
		<AudioClip {clip} {inTimeline} {zoom} {bounds} />
	{/if}
</div>
