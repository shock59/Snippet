<script lang="ts">
	import { type PromptInstance, resolvePrompt } from '../popups';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import ObjViewer from '$lib/components/ObjViewer.svelte';

	const { prompt }: { prompt: PromptInstance<'objectViewer'> } = $props();
</script>

<div class="items-left flex w-full flex-col gap-4">
	<ObjViewer object={prompt.params.object} />
</div>
<!-- <button
	on:click={() =>
		resolvePrompt(prompt.id, {
			secret: code
		})}
>
	Submit
</button> -->
