<script lang="ts">
	import Dialog from '$lib/components/ui/dialog';
	import { activePrompt, promptOpen, deletePrompt } from './popups';
	import Confirmation from './popups/Confirmation.svelte';
	import ObjectViewer from './popups/ObjectViewer.svelte';
	import RenderOptions from './popups/RenderOptions.svelte';
	import TextInputPrompt from './popups/TextInputPrompt.svelte';
</script>

{#if $activePrompt}
	{@const prompt = $activePrompt as any}

	{#key prompt}
		<Dialog.Root
			bind:open={
				() => $promptOpen,
				(v) => {
					if (!$activePrompt.preventClose) {
						$promptOpen = v;
					}
				}
			}
			onOpenChangeComplete={(open) => {
				console.log('open change complete', open);
				if (!open) deletePrompt(prompt.id);
			}}
		>
			<Dialog.Content
				showCloseButton={!$activePrompt.preventClose}
				class="flex max-h-screen w-[90vw] flex-col overflow-scroll sm:w-[70%] sm:max-w-184"
			>
				{#if prompt.type === 'confirmation'}
					<Confirmation {prompt} />
				{:else if prompt.type === 'objectViewer'}
					<ObjectViewer {prompt} />
				{:else if prompt.type === 'textInputPrompt'}
					<TextInputPrompt {prompt} />
				{:else if prompt.type === 'renderOptions'}
					<RenderOptions {prompt} />
				{:else}
					<div class="flex w-full flex-col items-center gap-4">
						<h2 class="mb-0 text-lg font-semibold">unknown prompt</h2>
						<p class="text-center text-sm text-muted-foreground">
							the prompt type <code>{prompt.type}</code> is not recognized
						</p>
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Root>
	{/key}
{/if}
