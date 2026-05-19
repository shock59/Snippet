<script lang="ts">
	export interface Clip {
		id: string;

		start: number;
		duration: number;

		name?: string;
		color?: string;
	}

	let {
		zoom,
		height = 64,

		clips = [],

		currentTime = 0,

		onClipSelect,
		onClipMove
	}: {
		zoom: number;

		height?: number;

		clips?: Clip[];

		currentTime?: number;

		onClipSelect?: (clip: Clip) => void;
		onClipMove?: (clip: Clip, time: number) => void;
	} = $props();

	function timeToX(time: number) {
		return time * zoom;
	}
</script>

<div class="track" style={`height:${height}px`}>
	{#each clips as clip (clip.id)}
		<button
			class="clip"
			style={`
				left:${timeToX(clip.start)}px;
				width:${clip.duration * zoom}px;
				background:${clip.color || '#666'};
			`}
			onclick={() => onClipSelect?.(clip)}
		>
			{clip.name || 'Clip'}
		</button>
	{/each}

	<div class="playhead" style={`left:${timeToX(currentTime)}px`}></div>
</div>

<style>
	.track {
		position: relative;

		width: 100%;

		overflow: hidden;
	}

	.clip {
		position: absolute;

		top: 8px;
		height: calc(100% - 16px);

		border-radius: 8px;

		padding: 8px;

		box-sizing: border-box;

		cursor: pointer;

		user-select: none;
	}

	.playhead {
		position: absolute;

		top: 0;
		bottom: 0;

		width: 2px;

		background: red;

		pointer-events: none;
	}
</style>
