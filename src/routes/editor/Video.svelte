<script lang="ts">
	let {
		src,
		time = 0,
		isPlaying = false,
		class: classN = ''
	}: {
		src: string;
		time?: number;
		isPlaying?: boolean;
		class?: string;
	} = $props();

	let video: HTMLVideoElement;
	let wasPlaying = false;

	$effect(() => {
		if (!video) return;

		if (isPlaying) {
			if (!wasPlaying) {
				video.currentTime = time;
				video.play().catch(() => {});
			}
		} else {
			video.pause();
			video.currentTime = time;
		}

		wasPlaying = isPlaying;
	});
</script>

<video bind:this={video} playsinline preload="auto" class={classN}>
	<source {src} />
</video>
