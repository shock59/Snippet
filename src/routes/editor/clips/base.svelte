<script lang="ts">
	import type { TimelineClip } from '$lib/media/types';

	type Props = { clip: TimelineClip; inTimeline?: boolean; zoom?: number };
	let { clip, inTimeline = false }: Props = $props();
</script>
