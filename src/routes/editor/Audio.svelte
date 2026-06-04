<script lang="ts">
	let {
		src,
		time = 0,
		isPlaying = false
	}: {
		src: string;
		time?: number;
		isPlaying?: boolean;
	} = $props();

	let audio: HTMLAudioElement;
	let wasPlaying = false;

	$effect(() => {
		if (!audio) return;

		if (isPlaying) {
			if (!wasPlaying) {
				audio.currentTime = time;
				audio.play().catch(() => {});
			}
		} else {
			audio.pause();
			audio.currentTime = time;
		}

		wasPlaying = isPlaying;
	});
</script>

<audio bind:this={audio} preload="auto">
	<source {src} />
</audio>
