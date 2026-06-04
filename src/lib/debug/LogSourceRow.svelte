<script lang="ts">
	import type { Shape, Source } from '.';
	import LogSource from './LogSource.svelte';

	type Props = {
		sources: Source[];
	};

	let { sources }: Props = $props();

	const overlappingEnds: [Shape, Shape][] = [
		['slanted', 'inverseslanted'],
		['angled', 'inverseangled'],
		['saw', 'inversesaw']
	];

	function shouldOverlap(a: Source, b?: Source) {
		if (!b) return false;
		const right = a.shapeRight;
		const left = b.shapeLeft;
		if (left === 'overlap') return true;
		return overlappingEnds.some(([a, b]) => {
			if (right === a && left === b) return true;
			if (right === b && left === a) return true;
			return false;
		});
	}
</script>

<div class="flex flex-row">
	{#each sources as source, index}
		<div
			style={(shouldOverlap(source, sources[index + 1]) ? 'margin-right: -10px;' : '') +
				`z-index: ${sources.length - index}`}
		>
			<LogSource {source} />
		</div>
	{/each}
</div>
