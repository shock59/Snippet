<script lang="ts">
	import { debuggerOpen, states as statesWritable } from '$lib/globals';
	import { slide } from 'svelte/transition';
	import LogSourceRow from './LogSourceRow.svelte';
	import Tabs from '$lib/components/ui/tabs';
	import { onDestroy } from 'svelte';
	import Logs from './Logs.svelte';
	import {
		createLogger,
		logFilters,
		sourceRegistry,
		stringifySources,
		type LogLevel,
		type Source
	} from '.';
	import ObjViewer from '$lib/components/ObjViewer.svelte';
	import { get } from 'svelte/store';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Ban, Bug, Info, Minus, OctagonX, Skull, TriangleAlert } from '@lucide/svelte';
	import Window from '../components/Window.svelte';
	import { registerKeybind } from '$lib/kbd';

	let x = $state(20);
	let y = $state(10);
	let width = $state(500);
	let height = $state(400);

	let states: Record<string, Record<string, any>> = $state({});
	const unsub = statesWritable.subscribe((v) => {
		states = v;
	});
	onDestroy(unsub);

	let sourceSearch = $state('');

	const levelMeta: { level: LogLevel; class: string; icon: any; label: string }[] = [
		{ level: 'default', class: 'text-muted-foreground', icon: Minus, label: 'Default' },
		{ level: 'info', class: 'text-info', icon: Info, label: 'Info' },
		{ level: 'debug', class: 'text-debug', icon: Bug, label: 'Debug' },
		{ level: 'warn', class: 'text-warning', icon: TriangleAlert, label: 'Warning' },
		{ level: 'error', class: 'text-destructive', icon: OctagonX, label: 'Error' },
		{ level: 'fatal', class: 'text-destructive/60', icon: Skull, label: 'Fatal' }
	];

	const filteredSources = $derived(
		Object.entries(get(sourceRegistry)).filter(([_, source]) => {
			if (!sourceSearch.trim()) return true;
			const text = source
				.map((s) => s.name)
				.join('/')
				.toLowerCase();
			return text.includes(sourceSearch.toLowerCase());
		})
	);

	function toggleLevel(source: Source[], level: LogLevel) {
		const string = stringifySources(...source);
		logFilters.update((filters) => {
			filters[string] ??= { enabled: true };
			const filter = filters[string];
			filter.enabled = true;
			filter.levels ??= {};
			filter.levels[level] = !(filter.levels[level] ?? true);
			return filters;
		});
	}

	function isLevelEnabled(source: Source[], level: LogLevel) {
		const string = stringifySources(...source);
		const filter = $logFilters[string];
		if (filter?.enabled === false) return false;
		return filter?.levels?.[level] !== false;
	}

	function isSourceEnabled(source: Source[]) {
		return $logFilters[stringifySources(...source)]?.enabled !== false;
	}

	function toggleSource(source: Source[]) {
		const string = stringifySources(...source);
		logFilters.update((filters) => {
			if (!filters[string]) {
				filters[string] = { enabled: false };
			} else {
				delete filters[string];
			}
			return { ...filters };
		});
	}

	function resetFilters() {
		logFilters.set({});
	}
</script>

<Window bind:open={$debuggerOpen} bind:x bind:y bind:width bind:height name="Debug">
	{#snippet icon()}
		<Bug size="1em" />
	{/snippet}

	{#snippet children()}
		<Tabs.Root value="sources" class="h-full w-full">
			<Tabs.List class="w-full">
				<Tabs.Trigger value="logs">Logs</Tabs.Trigger>
				<Tabs.Trigger value="sources">Sources</Tabs.Trigger>
				<Tabs.Trigger value="state">State</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="logs" class="flex min-h-0 flex-1 flex-col overflow-auto">
				<Logs />
			</Tabs.Content>

			<Tabs.Content value="sources" class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div class="flex items-center gap-2 border-b border-border/30 p-2">
					<Input
						bind:value={sourceSearch}
						placeholder="search"
						class="h-8 flex-1 rounded-md border border-border/50 bg-background/50
							   px-2 text-sm transition-all outline-none focus:border-primary/50"
					/>
					<Button onclick={resetFilters}>reset</Button>
				</div>

				<div class="flex min-h-0 flex-1 flex-col overflow-auto p-2">
					{#each filteredSources as [key, source] (key)}
						<div
							transition:slide
							class="group mb-1 flex items-center gap-2 rounded-md border
								   border-transparent p-1 transition-all
								   hover:border-border/40 hover:bg-accent/20"
						>
							<button
								class="min-w-0 flex-1 cursor-pointer overflow-hidden rounded-md
									   border border-transparent px-1 py-1 text-left transition-all"
								onclick={() => toggleSource(source)}
							>
								<div class:opacity-40={!isSourceEnabled(source)} class="transition-opacity">
									<LogSourceRow sources={source} />
								</div>
							</button>

							<div class="flex shrink-0 items-center gap-1">
								{#each levelMeta as meta (meta.level)}
									{@const enabled = isLevelEnabled(source, meta.level)}
									{@const Icon = meta.icon}
									<button
										class="flex size-7 cursor-pointer items-center justify-center
											   rounded-md border text-current transition-all
											   {meta.class}
											   {enabled ? 'border-current bg-current/15 opacity-100' : 'opacity-25'}"
										onclick={() => toggleLevel(source, meta.level)}
									>
										<Icon size="0.8rem" />
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</Tabs.Content>

			<Tabs.Content value="state" class="min-h-0 flex-1 overflow-auto">
				{#each Object.entries(states) as [name, w] (name)}
					<h3>{name}</h3>
					<ObjViewer object={w} />
				{/each}
			</Tabs.Content>
		</Tabs.Root>
	{/snippet}
</Window>
