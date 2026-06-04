<script lang="ts">
	import { type PromptInstance, resolvePrompt } from '../popups';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';

	const { prompt }: { prompt: PromptInstance<'confirmation'> } = $props();

	// svelte-ignore state_referenced_locally
	const countdown = prompt.params.confirmCountdown ?? 3000;
	const now = Date.now();

	let t = $state(1);

	let stop = false;

	function tick() {
		const elapsed = Date.now() - now;
		t = Math.max(0, 1 - elapsed / countdown);

		if (stop) return;

		if (t > 0) {
			requestAnimationFrame(tick);
		} else {
			t = 0;
			stop = true;
		}
	}
	onMount(() => {
		tick();
	});
</script>

<div class="flex w-full flex-col items-center gap-4">
	<h2 class="mb-0 text-lg font-semibold">{prompt.params.title}</h2>
	<p class="text-center text-sm text-muted-foreground">
		{prompt.params?.description}
	</p>

	<div class="flex w-full items-center justify-center gap-2">
		<div class="relative">
			<Button
				onclick={() => resolvePrompt(prompt.id, { confirmed: true })}
				variant={prompt.params.confirmVariant ?? 'default'}
				disabled={t !== 0}
			>
				{prompt.params?.confirmText ?? 'Confirm'}
			</Button>


			<div class="absolute top-0 left-0 flex h-full  w-full items-center justify-start pointer-events-none rounded-md overflow-hidden">
				<div style="width: {t * 100}%;" class="h-full bg-black/40"></div>
			</div>
		</div>
		<Button variant="outline" onclick={() => resolvePrompt(prompt.id, { confirmed: false })}>
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
