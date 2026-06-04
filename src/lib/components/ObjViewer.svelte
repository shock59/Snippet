<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import Self from './ObjViewer.svelte';
	import { slide } from 'svelte/transition';

	type Label = string | number | null;

	let {
		object,
		label = null,
		root = true,
		arrayItem = false
	}: {
		object: any;
		label?: Label;
		root?: boolean;
		arrayItem?: boolean;
	} = $props();

	export interface ParsedFunction {
		name: string | null;

		async: boolean;
		generator: boolean;
		arrow: boolean;
		anonymous: boolean;

		args: string[];
		argCount: number;

		source: string;
		body: string | null;

		hasRestParam: boolean;
		hasDestructuredParams: boolean;
		hasDefaultParams: boolean;
	}

	export function parseFunction(source: string): ParsedFunction {
		source = source.trim();

		const result: ParsedFunction = {
			name: null,

			async: false,
			generator: false,
			arrow: false,
			anonymous: false,

			args: [],
			argCount: 0,

			source,
			body: null,

			hasRestParam: false,
			hasDestructuredParams: false,
			hasDefaultParams: false
		};

		result.async = /^async\b/.test(source);
		result.generator = /^function\s*\*/.test(source) || /^async\s+function\s*\*/.test(source);
		result.arrow = source.includes('=>');

		const hasFunctionKeyword = /\bfunction\b/.test(source);

		if (result.arrow) {
			result.name = null;
			result.anonymous = true;
		} else if (hasFunctionKeyword) {
			const match = source.match(/^(?:async\s+)?function(?:\s*\*)?\s*([A-Za-z_$][\w$]*)?/);
			result.name = match?.[1] ?? null;
			result.anonymous = !result.name;
		} else {
			const match = source.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
			result.name = match?.[1] ?? null;
			result.anonymous = !result.name;
		}

		let argsRaw: string | null = null;

		if (result.arrow) {
			const arrowMatch =
				source.match(/^\s*(?:async\s*)?\((.*?)\)\s*=>/) ||
				source.match(/^\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/);
			argsRaw = arrowMatch?.[1] ?? null;
		} else {
			const match = source.match(/\((.*?)\)/);
			argsRaw = match?.[1] ?? null;
		}

		if (argsRaw != null) {
			result.args = splitArgs(argsRaw);
		}

		result.argCount = result.args.length;

		for (const arg of result.args) {
			if (arg.startsWith('...')) result.hasRestParam = true;
			if (arg.includes('{') || arg.includes('[')) result.hasDestructuredParams = true;
			if (arg.includes('=')) result.hasDefaultParams = true;
		}

		const bodyMatch = source.match(/\{([\s\S]*)\}$/);
		result.body = bodyMatch?.[1]?.trim() ?? null;

		return result;
	}

	function splitArgs(args: string): string[] {
		if (!args.trim()) return [];

		const out: string[] = [];
		let current = '';
		let depth = 0;

		for (const char of args) {
			if (char === ',' && depth === 0) {
				out.push(current.trim());
				current = '';
				continue;
			}
			if ('([{'.includes(char)) depth++;
			if (')]}'.includes(char)) depth--;
			current += char;
		}

		if (current.trim()) out.push(current.trim());
		return out;
	}

	type FunctionTokenType =
		| 'async'
		| 'generator'
		| 'arrow'
		| 'fn'
		| 'name'
		| 'anonymous'
		| 'punctuation'
		| 'arg';

	interface FunctionToken {
		type: FunctionTokenType;
		text: string;
	}

	export function tokenizeParsedFunction(fn: ParsedFunction): FunctionToken[] {
		const out: FunctionToken[] = [];

		if (fn.async) {
			out.push({ type: 'async', text: 'async' }, { type: 'punctuation', text: ' ' });
		}
		if (fn.generator) {
			out.push({ type: 'generator', text: 'generator' }, { type: 'punctuation', text: ' ' });
		}
		if (fn.arrow) {
			out.push({ type: 'arrow', text: 'arrow' }, { type: 'punctuation', text: ' ' });
		}

		out.push({ type: 'fn', text: 'fn' }, { type: 'punctuation', text: ' ' });
		out.push({
			type: fn.anonymous ? 'anonymous' : 'name',
			text: fn.anonymous ? 'anonymous' : (fn.name ?? 'anonymous')
		});
		out.push({ type: 'punctuation', text: '(' });
		fn.args.forEach((arg, i) => {
			out.push({ type: 'arg', text: arg });
			if (i !== fn.args.length - 1) {
				out.push({ type: 'punctuation', text: ', ' });
			}
		});
		out.push({ type: 'punctuation', text: ')' });

		return out;
	}

	type NestedBucket<T> = {
		[key: string]: T | NestedBucket<T>;
	};

	export function toBuckets<T>(arr: T[]): NestedBucket<T> {
		function build(start: number, end: number, size: number): NestedBucket<T> {
			const out: NestedBucket<T> = {};
			const total = end - start;

			if (total <= 50) {
				for (let i = start; i < end; i++) {
					out[i.toString()] = arr[i]!;
				}
				return out;
			}

			const childSize = Math.floor(total / 10);
			for (let chunkStart = start; chunkStart < end; chunkStart += childSize) {
				const chunkEnd = Math.min(chunkStart + childSize, end);
				const key = `${chunkStart}–${chunkEnd - 1}`;
				out[key] = build(chunkStart, chunkEnd, childSize);
			}

			return out;
		}

		if (arr.length <= 50) {
			return build(0, arr.length, arr.length);
		}

		let size = 50;
		while (size * 10 <= arr.length) {
			size *= 10;
		}

		return build(0, arr.length, size);
	}

	function isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
		return typeof value === 'object' && value !== null && Object.keys(value).length !== 0;
	}

	function isPrimitive(v: unknown): boolean {
		if (v === null || v === undefined) return true;
		const t = typeof v;
		return t !== 'object' && t !== 'function';
	}

	const inlineArrayMax = 6;
	function isInlineArray(value: unknown): value is unknown[] {
		return (
			Array.isArray(value) &&
			value.length > 0 &&
			value.length <= inlineArrayMax &&
			value.every(isPrimitive)
		);
	}

	function getSize(value: unknown): number {
		if (Array.isArray(value)) return value.length;
		if (typeof value === 'object' && value !== null) return Object.keys(value).length;
		return 0;
	}

	function summaryOf(value: unknown): string {
		const n = getSize(value);
		if (Array.isArray(value)) return `( ${n} )`;
		if (isExpandable(value)) return `( ${n} )`;
		return '';
	}

	const autoExpandThresh = 8;

	const shouldAutoExpand =
		// svelte-ignore state_referenced_locally
		!isInlineArray(object) && isExpandable(object) && getSize(object) <= autoExpandThresh;

	// svelte-ignore state_referenced_locally
	let expanded = $state(root || shouldAutoExpand);
	let userTouched = $state(false);

	function toggle() {
		userTouched = true;
		expanded = !expanded;
	}
</script>

{#snippet primitive(value: unknown)}
	{@const t = typeof value}
	{#if value === null}
		<span class="text-muted-foreground">null</span>
	{:else if t === 'undefined'}
		<span class="text-muted-foreground/60">undefined</span>
	{:else if t === 'number'}
		<span class="text-number">{String(value)}</span>
	{:else if t === 'bigint'}
		<span class="text-bigint">{String(value)}n</span>
	{:else if t === 'boolean'}
		<span class="text-bool">{String(value)}</span>
	{:else if t === 'string'}
		<span class="wrap-break-word whitespace-pre-wrap">"{value}"</span>
	{:else if t === 'symbol'}
		{@const match = (value as symbol).toString().match(/Symbol\((.*?)\)/)?.[1]}
		{#if match}
			<span class="text-symbol">Symbol<span class="token-punctuation">({match})</span></span>
		{:else}
			<span class="text-symbol">Symbol</span>
		{/if}
	{/if}
{/snippet}

{#snippet labelEl()}
	{#if label !== null}
		{#if arrayItem}
			<span class="array-index">{label}</span>
		{:else}
			<span class="obj-key">{label}</span>
		{/if}
	{/if}
{/snippet}

{#snippet display(value: unknown)}
	{@const type = typeof value}
	{@const expandable = isExpandable(value)}
	{@const inline = isInlineArray(value)}

	<div class="min-w-0">
		{#if inline}
			<div class="flex min-w-0 items-baseline gap-2">
				{@render labelEl()}
				<span class="wrap-break-word">
					<span class="text-muted-foreground/60">[</span>
					{#each value as item, i}
						{@render primitive(item)}
						{#if i < value.length - 1}
							<span class="text-muted-foreground/40">,&thinsp;</span>
						{/if}
					{/each}
					<span class="text-muted-foreground/60">]</span>
				</span>
				<span class="array-meta">Array ({value.length})</span>
			</div>
		{:else if expandable}
			<div class="flex min-w-0 items-start gap-2">
				{@render labelEl()}

				<div class="min-w-0 flex-1">
					<button
						class="flex min-w-0 cursor-pointer flex-row items-center text-left"
						onclick={toggle}
					>
						<span class="text-muted-foreground">
							<ChevronDown size="1.2em" class="{expanded ? '' : '-rotate-90'} transition-all" />
						</span>
						{#if !expanded}
							<span class="ml-1 text-nowrap text-muted-foreground" transition:slide={{ axis: 'x' }}>
								{Array.isArray(value) ? '[…]' : '{…}'}
							</span>
						{/if}
						<span class="ml-1 text-muted-foreground">
							{Array.isArray(value) ? 'Array' : 'Object'}
						</span>
						{#if !expanded}
							<span class="ml-1 text-nowrap text-muted-foreground" transition:slide={{ axis: 'x' }}>
								{summaryOf(value)}
							</span>
						{/if}
					</button>

					{#if expanded}
						<div class="ml-2 flex flex-col border-l pl-3" transition:slide>
							{#if Array.isArray(value)}
								{#if value.length > 50}
									{@const bucketed = toBuckets(value)}
									{#each Object.entries(bucketed) as [k, v]}
										<Self object={v} label={k} root={false} />
									{/each}
								{:else}
									{#each value as item, i}
										<Self object={item} label={i} root={false} arrayItem={true} />
									{/each}
								{/if}
							{:else}
								{#each Object.entries(value as Record<string, unknown>) as [k, v]}
									<Self object={v} label={k} root={false} />
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex min-w-0 items-baseline gap-2">
				{@render labelEl()}

				{#if type === 'object'}
					{#if Array.isArray(value)}
						<span class="token-punctuation">[]</span>
					{:else}
						<span class="token-punctuation">{'{}'}</span>
					{/if}
				{:else if type === 'function'}
					{@const parsed = parseFunction((value as Function).toString())}
					{@const tokens = tokenizeParsedFunction(parsed)}
					<span class="wrap-break-word whitespace-pre-wrap">
						{#each tokens as token}
							<span class={'token-' + token.type}>{token.text}</span>
						{/each}
					</span>
				{:else}
					{@render primitive(value)}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{@render display(object)}

<style>
	.array-index {
		color: var(--color-muted-foreground);
		opacity: 0.35;
		min-width: 2ch;
		text-align: right;
		user-select: none;
		flex-shrink: 0;
		line-height: inherit;
	}

	.obj-key {
		white-space: nowrap;
		color: var(--color-muted-foreground);
	}

	.array-meta {
		opacity: 0.35;
		color: var(--color-muted-foreground);
		user-select: none;
	}

	.token-async {
		color: var(--async);
	}

	.token-generator {
		color: var(--generator);
	}

	.token-arrow {
		color: var(--arrow);
	}

	.token-fn {
		color: var(--function);
	}

	.token-name {
		color: var(--function);
	}

	.token-anonymous {
		color: var(--color-muted-foreground);
		font-style: italic;
	}

	.token-arg {
		color: var(--args);
	}

	.token-punctuation {
		color: color-mix(in srgb, currentColor 50%, transparent);
	}
</style>
