<script lang="ts">
	import Self from './ObjPreview.svelte';

	let {
		value,
		depth = 0
	}: {
		value: unknown;
		depth?: number;
	} = $props();

	const maxDepth = 2;
	const arrInlineMax = 5;
	const objInlineMax = 5;
	const stringTruncate = 18;

	function isPlainObject(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	function truncate(s: string): string {
		return s.length > stringTruncate ? s.slice(0, stringTruncate) + '…' : s;
	}
</script>

{#if value === null}
	<span class="text-muted-foreground">null</span>
{:else if value === undefined}
	<span class="text-muted-foreground/60">undefined</span>
{:else if typeof value === 'boolean'}
	<span class="text-bool">{String(value)}</span>
{:else if typeof value === 'number'}
	<span class="text-number">{value}</span>
{:else if typeof value === 'bigint'}
	<span class="text-bigint">{value}n</span>
{:else if typeof value === 'string'}
	<span class="text-muted-foreground">"</span><span class="max-w-[12ch] truncate"
		>{truncate(value)}</span
	><span class="text-muted-foreground">"</span>
{:else if typeof value === 'symbol'}
	<span class="text-symbol">{value.toString()}</span>
{:else if typeof value === 'function'}
	<span class="text-muted-foreground italic">fn {value.name || 'anonymous'}</span>
{:else if Array.isArray(value)}
	{#if value.length === 0}
		<span class="text-muted-foreground">[]</span>
	{:else if value.length > arrInlineMax || depth >= maxDepth}
		<span class="pill">Array [{value.length}]</span>
	{:else}
		<span class="punct">[</span>
		{#each value as item, i}
			<Self value={item} depth={depth + 1} />
			{#if i < value.length - 1}<span class="sep">,&thinsp;</span>{/if}
		{/each}
		<span class="punct">]</span>
	{/if}
{:else if isPlainObject(value)}
	{@const entries = Object.entries(value)}
	{#if entries.length === 0}
		<span class="text-muted-foreground">{'{}'}</span>
	{:else if entries.length > objInlineMax || depth >= maxDepth}
		<span class="pill">Object {'{' + entries.length + '}'}</span>
	{:else}
		<span class="punct">{'{'}</span>
		{#each entries as [k, v], i}
			<span class="key">{k}</span><span class="sep">:&thinsp;</span><Self
				value={v}
				depth={depth + 1}
			/>
			{#if i < entries.length - 1}<span class="sep">,&thinsp;</span>{/if}
		{/each}
		<span class="punct">{'}'}</span>
	{/if}
{/if}

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		border-left: 1px solid color-mix(in srgb, var(--special, currentColor) 20%, transparent);
		border-right: 1px solid color-mix(in srgb, var(--special, currentColor) 20%, transparent);
		border-top: 1px solid transparent;
		border-bottom: 1px solid transparent;
		color: var(--special, var(--color-muted-foreground));
		border-radius: 4px;
		padding: 0 0.35em;
		font-size: 0.85em;
		line-height: 1.2;
	}

	.key {
		color: var(--color-muted-foreground);
	}

	.punct {
		color: color-mix(in srgb, var(--color-muted-foreground) 60%, transparent);
	}

	.sep {
		color: color-mix(in srgb, var(--color-muted-foreground) 40%, transparent);
	}
</style>
