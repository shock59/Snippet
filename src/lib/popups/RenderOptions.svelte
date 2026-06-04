<script lang="ts">
	import Flex from '$lib/components/Flex.svelte';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import { projects } from '$lib/media/manager';
	import { OPFS } from '$lib/media/OPFS';
	import { resolvePrompt, type PromptInstance } from '$lib/popups';
	import { render, type RenderProgressSnapshot } from '$lib/render';
	import { getSupported, getAllowedValues } from '$lib/render/supports';
	import { sleep } from '$lib/utils';
	import { ArrowRight, Ban, ChevronUp, Minus, X } from '@lucide/svelte';
	import { type AudioCodec, type VideoCodec } from 'mediabunny';
	import { onDestroy } from 'svelte';
	import { fly, slide } from 'svelte/transition';

	const { prompt }: { prompt: PromptInstance<'renderOptions'> } = $props();

	let { fps, length } = prompt.params.options;

	let container = $state<string>();
	let videoCodec = $state<string>();
	let audioCodec = $state<string>();

	const supportedPromise = getSupported();

	let advancedVisible = $state(false);

	const videoPriority: VideoCodec[] = ['av1', 'vp9', 'hevc', 'avc', 'vp8'];

	const audioPrioritoy: AudioCodec[] = ['opus', 'aac', 'flac', 'vorbis', 'mp3', 'eac3', 'ac3'];

	export function getBestCodecs(
		datastore: Awaited<ReturnType<typeof getSupported>>,
		container: string
	): {
		video: VideoCodec | null;
		audio: AudioCodec | null;
	} {
		const records = Object.values(datastore.combos).filter((x) => x.container === container);

		let video: VideoCodec | null = null;
		let audio: AudioCodec | null = null;

		for (const codec of videoPriority) {
			if (records.some((x) => x.video === codec && x.containerSupportsVideo && x.browserVideoOk)) {
				video = codec;
				break;
			}
		}

		for (const codec of audioPrioritoy) {
			if (records.some((x) => x.audio === codec && x.containerSupportsAudio && x.browserAudioOk)) {
				audio = codec;
				break;
			}
		}

		return { video, audio };
	}

	function formatTimestamp(seconds: number) {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor(seconds / 3600) % 24;
		const mins = Math.floor(seconds / 60) % 60;
		const secs = Math.floor(seconds % 60);

		const ms = Math.floor((seconds % 1) * 100).toString();
		let result = '';

		if (days > 0) {
			result += `${days}d `;
		}

		if (hours > 0 || days > 0) {
			result += `${hours.toString()}h `;
		}

		result += `${mins.toString()}m ${secs.toString()}s ${ms}ms`;

		return result;
	}

	let showRenderProgress = $state(false);

	let renderProgress: RenderProgressSnapshot | null = $state(null);
	let renderDone = $state(false);

	let finalUrl = $state('');

	function setFinalUrl(v: string) {
		URL.revokeObjectURL(finalUrl);
		finalUrl = v;
	}

	onDestroy(() => {
		URL.revokeObjectURL(finalUrl);
	});

	const colorVars = {
		preload: 'playhead',
		video: 'snippet-lavender',
		audio: 'snipper-yellow',
		finalize: 'symbol'
	};

	let cancelled = false;

	let startFrame: number = $state(0);
	let endFrame: number = $state(Math.ceil(fps * length));
</script>

{#await supportedPromise}
	Loading...
{:then supported}
	{@const video = (container &&
		getAllowedValues(supported, {
			container: container as any,
			audio: audioCodec as any
		})) as ReturnType<typeof getAllowedValues>}

	{@const audio = (container &&
		getAllowedValues(supported, {
			container: container as any,
			video: videoCodec as any
		})) as ReturnType<typeof getAllowedValues>}

	{@const containers = [...new Set(Object.values(supported.combos).map((x) => x.container))]}

	{@const videoCodecs = [...new Set(Object.values(supported.combos).map((x) => x.video))]}

	{@const audioCodecs = [...new Set(Object.values(supported.combos).map((x) => x.audio))]}
	{#if !showRenderProgress || renderDone}
		<div transition:fly class="absolute top-2 right-2">
			<Button
				variant="ghost"
				size="icon"
				onclick={async () => {
					resolvePrompt(prompt.id, {});
				}}
			>
				<X />
			</Button>
		</div>
	{/if}
	<div>
		<h1 class="mb-4 border-b pb-2 text-lg">Render</h1>
		{#if !showRenderProgress}
			<div class="mb-2 flex flex-col gap-2" transition:slide>
				<div>
					<h2>Format</h2>
					<div class="flex flex-wrap justify-stretch gap-1">
						{#each containers as c}
							<Button
								variant={container === c ? 'default' : 'outline'}
								onclick={() => {
									container = c;
									if (!advancedVisible) {
										const best = getBestCodecs(supported, container);
										videoCodec = best.video ?? undefined;
										audioCodec = best.audio ?? undefined;
									} else {
										if (!audio?.videos.has(videoCodec as any)) videoCodec = undefined;
										if (!video?.audios.has(audioCodec as any)) audioCodec = undefined;
									}
								}}
							>
								{c}
							</Button>
						{/each}
					</div>
				</div>
				<div class="mt-2">
					<Button
						size="sm"
						variant="ghost"
						onclick={() => {
							advancedVisible = !advancedVisible;
						}}
					>
						Advanced Options <ChevronUp
							class="{advancedVisible ? 'rotate-180' : 'rotate-90'} transition-transform"
						/>
					</Button>
					<div class="">
						{#if advancedVisible}
							<div
								transition:slide
								class=" mt-2 flex flex-col gap-3 rounded-lg bg-background px-4 py-2"
							>
								<div>
									<h2>Video Codec</h2>
									<div class="flex flex-wrap gap-2">
										{#each videoCodecs as codec}
											<Button
												variant={videoCodec === codec ? 'default' : 'outline'}
												disabled={!video?.videos.has(codec)}
												onclick={() => {
													videoCodec = codec;
												}}
											>
												{codec}
											</Button>
										{/each}
									</div>
								</div>
								<div>
									<h2>Audio Codec</h2>
									<div class="flex flex-wrap gap-2">
										{#each audioCodecs as codec}
											<Button
												variant={audioCodec === codec ? 'default' : 'outline'}
												disabled={!audio?.audios.has(codec)}
												onclick={() => {
													audioCodec = codec;
												}}
											>
												{codec}
											</Button>
										{/each}
									</div>
								</div>
								<div>
									<div class="flex flex-wrap gap-2">
										<!-- <div class="flex flex-row"></div> -->
										<Flex col>
											<span>Frame range</span>
											<span class="text-sm text-muted-foreground"
												>Only frames within this range will be rendered</span
											>
											<Flex row yCenter gap={2}>
												<Input
													type="number"
													min={0}
													max={fps * length}
													aria-invalid={startFrame > endFrame}
													bind:value={startFrame}
												/>
												<Minus />
												<Input
													type="number"
													min={0}
													max={fps * length}
													aria-invalid={startFrame > endFrame}
													bind:value={endFrame}
												/>
											</Flex>
										</Flex>
										<Flex col>
											<span>FPS</span>
											<span class="text-sm text-muted-foreground">
												(you should probably be changing this in project settings)
											</span>
											<Input
												type="number"
												min={0}
												max={fps * length}
												aria-invalid={startFrame > endFrame}
												bind:value={startFrame}
											/>
										</Flex>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
				<div class="border-t pt-4">
					<p>Render info</p>
					<svelte:boundary>
						{@const info = {
							fps: prompt.params.options.fps,
							width: prompt.params.options.width,
							height: prompt.params.options.height,
							length: formatTimestamp(prompt.params.options.length)
						}}
						<div>
							{#each Object.entries(info) as [k, v]}
								<p>{k}: {v}</p>
							{/each}
						</div>
					</svelte:boundary>
				</div>
			</div>
		{/if}
		{#if !renderDone}
			<div transition:slide class="flex flex-row">
				<Button
					disabled={!(container && videoCodec && audioCodec && !(startFrame > endFrame))}
					class="flex flex-4 flex-col"
					variant={showRenderProgress ? 'destructive' : 'default'}
					onclick={async () => {
						if (showRenderProgress) {
							showRenderProgress = false;
							setFinalUrl('');
							renderDone = false;
							renderProgress = null;
							cancelled = true;
						} else {
							try {
								showRenderProgress = true;
								renderDone = false;
								cancelled = false;

								await render(prompt.params.clips, {
									...prompt.params.options,
									onProgress(progress) {
										renderProgress = progress;
									},
									container: container!,
									audioCodec: audioCodec!,
									videoCodec: videoCodec!,
									endFrame,
									startFrame,
									isCancelled() {
										return cancelled;
									}
								});
								const storedFile = await (await OPFS.fileHandle('/render')).getFile();
								setFinalUrl(URL.createObjectURL(storedFile));
								console.log(finalUrl);
								await sleep(500);
								renderDone = true;
							} catch (error) {
								cancelled = false;
								if (error !== 'render cancelled') throw error;
							}
						}
					}}
				>
					{#if !showRenderProgress}
						<span transition:slide class="flex flex-row items-center gap-2"
							>Begin render <ArrowRight /></span
						>
					{:else}
						<span transition:slide class="flex flex-row items-center gap-2"
							>Cancel render <Ban /></span
						>
					{/if}
				</Button>
			</div>
		{/if}
		{#if showRenderProgress}
			<div transition:slide class="flex flex-col">
				<div class="my-4 flex w-full justify-center">
					<div
						class="relative flex h-auto max-h-300 w-3/4 flex-col-reverse overflow-hidden rounded-md bg-black"
						style="aspect-ratio: {prompt.params.options.width}/{prompt.params.options.height};"
					>
						{#if renderProgress}
							{#each Object.entries(renderProgress.steps) as [name, dat]}
								<div
									class="striped transition-all ease-out"
									style="height: {dat.progress * dat.weight}%; background-color: var(--{colorVars[
										name as keyof typeof colorVars
									]}); width:100%; opacity: {renderDone ? '0%' : '100%'};"
								></div>
							{/each}
							<div class="absolute top-0 left-0 flex h-full w-full flex-col">
								<div
									class="striped stripe transition-all ease-out"
									style="height:100%; width: 100%; opacity: {renderDone ? '0%' : '40%'};"
								></div>
							</div>
							<div
								class="absolute top-0 left-0 flex h-full w-full flex-col items-center justify-center"
							>
								<span class="rounded-md bg-black/50 px-3 py-1 font-mono text-white"
									>{renderProgress.total.toFixed(2)}%</span
								>
							</div>
							{#if finalUrl}
								<div
									class="absolute top-0 left-0 flex h-full w-full flex-col"
									style="opacity: {renderDone ? '100%' : '0%'};"
								>
									<!-- svelte-ignore a11y_media_has_caption -->
									<video controls preload="auto" class="h-full w-full">
										<source src={finalUrl} />
									</video>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			</div>
		{/if}
		{#if renderDone}
			<div transition:slide class="flex flex-row gap-3">
				<Button
					class="flex flex-1 flex-row"
					variant="outline"
					onclick={async () => {
						resolvePrompt(prompt.id, {});
					}}
				>
					Close
				</Button>
				<Button
					class="flex flex-3 flex-row"
					onclick={async () => {
						const stream = await OPFS.readStream('/render');
						const streamSaver = (await import('streamsaver')).default;
						const fileStream = streamSaver.createWriteStream(
							`${projects.current.trim()}.${container}`
						);
						await stream.pipeTo(fileStream);
					}}
				>
					Download
					<span class="text-mono rounded-sm bg-background/40 px-1">
						{projects.current.trim()}.{container}
					</span>
				</Button>
			</div>
		{/if}
	</div>
{/await}

<style>
	.stripe {
		background-image: linear-gradient(
			45deg,
			#00000050 4.55%,
			#000000 4.55%,
			#000000 50%,
			#00000050 50%,
			#00000050 54.55%,
			#000000 54.55%,
			#000000 100%
		);
		background-size: 31.11px 31.11px;
	}
</style>
