<script lang="ts">
	import { type PromptInstance, resolvePrompt } from '../popups';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { Input } from '$lib/components/ui/input';

	const { prompt }: { prompt: PromptInstance<'textInputPrompt'> } = $props();

	const valid = $derived(prompt.params.valid ?? (() => true));

	// svelte-ignore state_referenced_locally
	let value = $state(prompt.params.default ?? '');
</script>

<div class="flex w-full flex-col items-center gap-4">
	<h2 class="mb-0 text-lg font-semibold">{prompt.params.title}</h2>
	<p class="text-center text-sm text-muted-foreground">
		{prompt.params?.description}
	</p>

	<Input bind:value aria-invalid={!valid(value)} />

	<div class="flex w-full items-center justify-center gap-2">
		<Button
			onclick={() => resolvePrompt(prompt.id, { value })}
			variant={prompt.params.confirmVariant ?? 'default'}
			disabled={!valid(value)}
		>
			{prompt.params?.confirmText ?? 'Confirm'}
		</Button>
		<Button variant="outline" onclick={() => resolvePrompt(prompt.id, { value: null })}>
			{prompt.params?.cancelText ?? 'Cancel'}
		</Button>
	</div>
</div>
<!-- <button
	on:click={() =>
		resolvePrompt(prompt.id, {
			secret: code
		})}
>
	Submit
</button> -->
