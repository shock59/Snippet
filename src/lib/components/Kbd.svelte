<script lang="ts">
	import { activeChord, parseKeybind, pressedKeys } from '$lib/kbd';
	import type { KeybindStep } from '$lib/kbd.svelte';
	import {
		ArrowBigUpDash,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		CornerDownLeft
	} from '@lucide/svelte';

	type Props = {
		keys: string | KeybindStep[];
		down?: boolean;
		scale?: number;
	};

	const { keys: rawKeys, down = true, scale = 1 }: Props = $props();

	const parsedKeys = $derived(typeof rawKeys === 'string' ? parseKeybind(rawKeys).steps : rawKeys);
</script>

<div class="flex flex-row items-center" style:gap="{8 * scale}px">
	{#each parsedKeys as step}
		<div class="flex flex-row items-center" style:gap="{2 * scale}px">
			{#each step as token}
				{#if token.type === 'key'}
					<span>{@render key(token.key.trim())}</span>
				{:else}
					<span class="mb-1">+</span>
				{/if}
			{/each}
		</div>
	{/each}
</div>

{#snippet key(kv: string)}
	<div
		class="relative inset-0 flex rounded-sm bg-popover/50 font-mono leading-none outline outline-border/50"
		style="
      height: {14 * scale}px;
      padding-inline: {4 * scale}px;
     font-size: {12 * scale}px;
    "
	>
		<div
			class="absolute top-0 left-0 flex rounded-sm bg-popover font-mono leading-none outline outline-border transition-transform duration-150"
			style="
      transform: translateY({$pressedKeys.has(kv) && down ? -1 : -2}px);
      height: {14 * scale}px;
      padding-inline: {4 * scale}px;
      "
		>
			{@render keyContent(kv)}
		</div>
		<span class="opacity-0">{@render keyContent(kv)}</span>
	</div>
{/snippet}

{#snippet keyContent(kv: string)}
	{#if ['up', 'down', 'left', 'right'].includes(kv)}
		{@const Arrow = {
			up: ChevronUp,
			down: ChevronDown,
			left: ChevronLeft,
			right: ChevronRight
		}[kv]}
		<Arrow size="1em" />
	{:else if kv === 'shift'}
		<ArrowBigUpDash size="1em" />
	{:else if kv === 'enter'}
		<CornerDownLeft size="1em" />
	{:else}
		<span
			style="
    transform: translateY({0.5 * scale}px);
    "
		>
			{kv}
		</span>
	{/if}
{/snippet}
