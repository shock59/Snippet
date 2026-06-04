<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { logFilters, loggerLogger, logs, matchesLogFilters, type Log, type LogFilters } from '.';
	import LogSourceRow from './LogSourceRow.svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import promptFor from '$lib/popups';
	import ObjPreview from '$lib/components/ObjPreview.svelte';

	const LogRendererLogger = loggerLogger.child('renderer');

	const RowHeight = 20;
	const Overscan = 8;

	type CombinedLog = {
		log: Log;
		count: number;
	};

	let rawLogs: Log[] = [];
	let rawFilters: LogFilters = {};
	let filteredLogs: Log[] = [];
	let displayLogs: CombinedLog[] = [];

	let scroller: HTMLDivElement;

	let scrollTop = 0;
	let viewportHeight = 0;

	let start = 0;
	let end = 0;

	let topPad = $state(0);
	let bottomPad = $state(0);

	let visibleLogs: CombinedLog[] = $state([]);

	let isNearBottom = $state(true);

	let resizeObserver: ResizeObserver | null = null;

	function sameLogContent(a: Log, b: Log) {
		try {
			return (
				JSON.stringify(a.sources) === JSON.stringify(b.sources) &&
				JSON.stringify(a.content) === JSON.stringify(b.content)
			);
		} catch (error) {
			// LogRendererLogger.warn('error comparing logs', error);
			return false;
		}
	}

	function combineLogs(logs: Log[]): CombinedLog[] {
		const combined: CombinedLog[] = [];

		for (const log of logs) {
			const last = combined[combined.length - 1];

			if (last && sameLogContent(last.log, log)) {
				last.count++;
				continue;
			}

			combined.push({
				log,
				count: 1
			});
		}

		return combined;
	}

	function recompute() {
		const totalHeight = displayLogs.length * RowHeight;

		start = Math.max(0, Math.floor(scrollTop / RowHeight) - Overscan);

		end = Math.min(
			displayLogs.length,
			Math.ceil((scrollTop + viewportHeight) / RowHeight) + Overscan
		);

		topPad = start * RowHeight;
		bottomPad = Math.max(0, totalHeight - end * RowHeight);

		visibleLogs = displayLogs.slice(start, end);
	}

	function updateBottomState() {
		const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

		isNearBottom = distanceFromBottom < 40;
	}
	// svelte-ignore state_referenced_locally
	let shouldStick = isNearBottom;

	function handleScroll() {
		scrollTop = scroller.scrollTop;
		shouldStick = isNearBottom;

		updateBottomState();
		recompute();
	}

	async function scrollToBottom(smooth = true) {
		await tick();

		scroller.scrollTo({
			top: scroller.scrollHeight,
			behavior: smooth ? 'smooth' : 'instant'
		});
	}

	const sampleSize = 5;
	const shiftDistance = 10;

	function sameLogId(a?: Log, b?: Log) {
		if (!a || !b) return false;

		return a.id === b.id;
	}

	function matchesSample(a: Log[], b: Log[], aStart: number, bStart: number, count: number) {
		for (let i = 0; i < count; i++) {
			if (!sameLogId(a[aStart + i], b[bStart + i])) {
				return false;
			}
		}

		return true;
	}

	function appendIncrementalLogs(nextLogs: Log[]) {
		if (nextLogs.length === 0) {
			rawLogs = [];
			filteredLogs = [];
			displayLogs = [];
			return;
		}

		if (rawLogs.length === 0) {
			rawLogs = nextLogs;
			filteredLogs = rawLogs.filter((log) => matchesLogFilters(log, rawFilters));
			displayLogs = combineLogs(filteredLogs);
			return;
		}

		const oldLength = rawLogs.length;
		const newLength = nextLogs.length;

		if (newLength < oldLength) {
			rawLogs = nextLogs;
			filteredLogs = rawLogs.filter((log) => matchesLogFilters(log, rawFilters));
			displayLogs = combineLogs(filteredLogs);
			return;
		}

		if (newLength === oldLength) {
			if (matchesSample(rawLogs, nextLogs, 0, 0, Math.min(sampleSize, oldLength))) {
				return;
			}
			rawLogs = nextLogs;
			filteredLogs = rawLogs.filter((log) => matchesLogFilters(log, rawFilters));
			displayLogs = combineLogs(filteredLogs);
			return;
		}

		const growth = newLength - oldLength;

		const headMatches = matchesSample(rawLogs, nextLogs, 0, 0, Math.min(sampleSize, oldLength));

		const tailMatches = matchesSample(
			rawLogs,
			nextLogs,
			Math.max(0, oldLength - sampleSize),
			Math.max(0, oldLength - sampleSize),
			Math.min(sampleSize, oldLength)
		);

		if (headMatches && tailMatches) {
			const appended = nextLogs.slice(oldLength);

			rawLogs = nextLogs;

			const newFiltered = appended.filter((log) => matchesLogFilters(log, rawFilters));

			if (newFiltered.length > 0) {
				filteredLogs.push(...newFiltered);
				displayLogs = combineLogs(filteredLogs);
			}

			return;
		}

		for (let shift = 1; shift <= Math.min(shiftDistance, growth); shift++) {
			const aligned = matchesSample(rawLogs, nextLogs, 0, shift, Math.min(sampleSize, oldLength));
			if (!aligned) continue;

			const appended = nextLogs.slice(oldLength + shift);
			rawLogs = nextLogs;
			const newFiltered = appended.filter((log) => matchesLogFilters(log, rawFilters));

			if (newFiltered.length > 0) {
				filteredLogs.push(...newFiltered);
				displayLogs = combineLogs(filteredLogs);
			}

			return;
		}

		rawLogs = nextLogs;
		filteredLogs = rawLogs.filter((log) => matchesLogFilters(log, rawFilters));
		displayLogs = combineLogs(filteredLogs);
	}

	onMount(() => {
		async function update(v: { logs?: Log[]; filters?: LogFilters }) {
			shouldStick = isNearBottom;
			if (v.filters) {
				rawFilters = v.filters;

				filteredLogs = rawLogs.filter((log) => matchesLogFilters(log, rawFilters));

				displayLogs = combineLogs(filteredLogs);
			}

			if (v.logs) {
				appendIncrementalLogs(v.logs);
			}
			recompute();

			if (shouldStick) {
				await scrollToBottom(false);
			}
		}
		const stopLogListening = logs.subscribe(async (value) => {
			// the line below blew up my pc
			// LogRendererLogger('updating log');
			update({ logs: value });
		});

		const stopFilterListening = logFilters.subscribe(async (value) => {
			LogRendererLogger('updating filter', value);
			handleScroll();
			update({ filters: value });
		});

		viewportHeight = scroller.clientHeight;

		recompute();

		resizeObserver = new ResizeObserver(() => {
			viewportHeight = scroller.clientHeight;
			if (shouldStick) {
				scrollToBottom(false);
			}
			recompute();
		});

		resizeObserver.observe(scroller);

		queueMicrotask(() => {
			scrollToBottom(false);
		});

		return () => {
			stopLogListening();
			stopFilterListening();
			resizeObserver?.disconnect();
		};
	});
</script>

<div class="pointer-events-auto relative h-full min-h-0">
	<div
		bind:this={scroller}
		class="h-full min-h-0 overflow-auto rounded-lg bg-background p-2"
		onscroll={handleScroll}
	>
		<div style={`padding-top:${topPad}px; padding-bottom:${bottomPad}px;`}>
			{#each visibleLogs as entry (entry.log.id)}
				<div
					class="mb-2 flex h-5 flex-row items-center gap-2 {entry.log.level === 'fatal' &&
						'bg-destructive/40'} rounded-sm"
				>
					<div
						class="-mr-6 -ml-1 h-full w-5 shrink-0 rounded-sm"
						style:background="var(--{{
							info: 'info',
							warn: 'warning',
							debug: 'debug',
							error: 'destructive',
							fatal: 'muted',
							default: ''
						}[entry.log.level]})"
					></div>

					<div class="shrink-0">
						<LogSourceRow sources={entry.log.sources} />
					</div>

					<div class="flex min-w-0 flex-1 flex-row gap-2 text-sm">
						{#each entry.log.content as item}
							<div class="truncate font-mono">
								{#if item.type === 'object'}
									<button
										class="cursor-pointer rounded-sm bg-special/10 px-2 **:justify-center"
										onclick={() => {
											promptFor('objectViewer', {
												object: item.value
											}).catch(() => {});
										}}
									>
										<ObjPreview value={item.value} />
									</button>
								{:else if item.type === 'error'}
									<button
										class="cursor-pointer rounded-sm bg-destructive/20 px-2 text-destructive"
										onclick={() => {
											promptFor('objectViewer', {
												object: item.value
											}).catch(() => {});
										}}
									>
										{`Error [${item.value.name}]`}
									</button>
								{:else if item.type === 'null'}
									<span class="text-muted-foreground">null</span>
								{:else if item.type === 'undefined'}
									<span class="text-muted-foreground/60">undefined</span>
								{:else if item.type === 'number'}
									<span class="text-number">{String(item.value)}</span>
								{:else if item.type === 'boolean'}
									<span class="text-bool">{String(item.value)}</span>
								{:else}
									<span>{String(item.value)}</span>
								{/if}
							</div>
						{/each}
					</div>

					{#if entry.count > 1}
						<div
							class="flex shrink-0 flex-row rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium opacity-70"
							transition:slide={{ axis: 'x' }}
						>
							x
							<div class="flex flex-row">
								{#each entry.count.toString().split('') as digit, index (index)}
									<div class="relative flex flex-col" transition:slide={{ axis: 'x' }}>
										{#key digit}
											<p class="bg-muted/50">
												{digit}
											</p>
										{/key}
										<!-- <span class="opacity-0">0</span> -->
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
