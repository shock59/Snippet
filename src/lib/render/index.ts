import { OPFS } from '$lib/media/OPFS';
import {
	clipType,
	type AudioClip,
	type ImageClip,
	type SolidClip,
	type TextClip,
	type TimelineClip,
	type VideoClip
} from '$lib/media/types';
import {
	Output,
	Mp4OutputFormat,
	BufferTarget,
	CanvasSource,
	QUALITY_HIGH,
	type StreamTargetChunk,
	StreamTarget,
	AudioSample,
	AudioSampleSink,
	BlobSource,
	ALL_FORMATS,
	Input,
	AudioSampleSource,
	MovOutputFormat,
	AudioBufferSink,
	MkvOutputFormat,
	WebMOutputFormat
} from 'mediabunny';
import { defaultTransform } from '../../routes/editor/visibleClips';
import { getAssetFile } from '$lib/media/assets';
import { createLogger } from '$lib/debug';
import { sleep } from '$lib/utils';

const progressStepIds = ['preload', 'video', 'audio', 'finalize'] as const;
type ProgressStepId = (typeof progressStepIds)[number];

type ProgressStepState = {
	progress: number;
	weight: number;
};

export type RenderProgressSnapshot = {
	total: number;
	steps: Record<ProgressStepId, ProgressStepState>;
};

type RenderProgressCallback = (progress: RenderProgressSnapshot) => void;

const defaultProgressWeights: Record<ProgressStepId, number> = {
	preload: 0.15,
	video: 0.55,
	audio: 0.25,
	finalize: 0.05
};

function clamp01(n: number) {
	return Math.max(0, Math.min(1, n));
}

class ProgressTracker {
	private steps: Record<ProgressStepId, ProgressStepState>;
	private lastEmit = 0;

	constructor(
		private readonly onProgress?: RenderProgressCallback,
		weights: Partial<Record<ProgressStepId, number>> = {}
	) {
		const merged = { ...defaultProgressWeights, ...weights };
		const totalWeight = Object.values(merged).reduce((sum, w) => sum + w, 0) || 1;

		this.steps = {
			preload: { progress: 0, weight: merged.preload / totalWeight },
			audio: { progress: 0, weight: merged.audio / totalWeight },
			video: { progress: 0, weight: merged.video / totalWeight },
			finalize: { progress: 0, weight: merged.finalize / totalWeight }
		};
	}

	setStep(step: ProgressStepId, progress01: number, force = false) {
		this.steps[step].progress = clamp01(progress01) * 100;
		this.emit(force);
	}

	snapshot(): RenderProgressSnapshot {
		let total = 0;

		for (const step of progressStepIds) {
			total += (this.steps[step].progress / 100) * this.steps[step].weight;
		}

		return {
			total: total * 100,
			steps: this.steps
		};
	}

	private emit(force = false) {
		if (!this.onProgress) return;

		const now = performance.now();
		if (!force && now - this.lastEmit < 50) return;
		this.lastEmit = now;

		this.onProgress(this.snapshot());
	}
}

const renderLogger = createLogger('render');

const cacheLogger = renderLogger.child('cache');
const videoLogger = renderLogger.child('video');
const audioLogger = renderLogger.child('audio');
const muxLogger = renderLogger.child('mux');
const assetLogger = renderLogger.child('asset');

const videoFrameLogger = videoLogger.child('frame');
const videoFrameTransformsLogger = videoFrameLogger.child('transforms');
const videoFrameClipLogger = videoFrameLogger.child('clip');
const videoFrameDrawLogger = videoFrameLogger.child('draw');

// const audioFrameLogger = audioLogger.child('frame');
// const audioFrameSourceLogger = audioFrameLogger.child('source');
// const audioFrameMixLogger = audioFrameLogger.child('mix');

const audioBitrate = 192000;

export async function render(
	clips: TimelineClip[],
	options: {
		fps: number;
		width: number;
		height: number;
		length: number;
		startFrame?: number;
		endFrame?: number;

		onProgress?: RenderProgressCallback;
		progressWeights?: Partial<Record<ProgressStepId, number>>;
		container: string;
		audioCodec: string;
		videoCodec: string;
		isCancelled?: () => boolean;
	}
) {
	const renderStart = performance.now();
	const {
		fps,
		height,
		length,
		width,
		audioCodec,
		videoCodec,
		container,
		isCancelled,
		startFrame,
		endFrame
	} = options;
	const frameDuration = 1 / fps;
	const totalFrames = Math.ceil(length * fps);
	const startSecondOffset = (startFrame ?? 0) / fps;

	const progress = new ProgressTracker(options.onProgress, options.progressWeights);
	progress.setStep('preload', 0, true);
	progress.setStep('audio', 0, true);
	progress.setStep('video', 0, true);
	progress.setStep('finalize', 0, true);
	await sleep(500);

	renderLogger('starting render', {
		fps,
		width,
		height,
		length,
		totalFrames
	});

	renderLogger.debug(await probeAudioEncoders());
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas ctx is null');

	const assetCache = new AssetCache();
	await assetCache.preload(clips, (p) => progress.setStep('preload', p));
	progress.setStep('preload', 1, true);

	renderLogger('assets preloaded', {
		clips: clips.length
	});

	await OPFS.delete('/render');

	const writer = await OPFS.writer('/render');

	let pending = Promise.resolve();

	const writable = new WritableStream({
		write: (chunk) => {
			pending = pending.then(() => writer.write(chunk));
			return pending;
		},

		close: async () => {
			await pending;
			await writer.close();
		}
	});

	const output = new Output({
		format: new (
			{
				webm: WebMOutputFormat,
				mkv: MkvOutputFormat,
				mp4: Mp4OutputFormat,
				mov: MovOutputFormat
			} as any
		)[container as any](),
		target: new StreamTarget(writable)
		// target: new BufferTarget()
	});

	const videoSource = new CanvasSource(canvas, {
		codec: videoCodec as any, //  "avc" | "hevc" | "vp9" | "av1" | "vp8"
		bitrate: QUALITY_HIGH
	});
	output.addVideoTrack(videoSource);

	const audioSource = new AudioSampleSource({
		codec: audioCodec as any, // "aac" | "opus" | "mp3" | "vorbis" | "flac" | "ac3" | "eac3" | "pcm-s16" | "pcm-s16be" | "pcm-s24" | "pcm-s24be" | "pcm-s32" | "pcm-s32be" | "pcm-f32" | "pcm-f32be" | "pcm-f64" | "pcm-f64be" | "pcm-u8" | "pcm-s8" | "ulaw" | "alaw"
		bitrate: audioBitrate
	});

	output.addAudioTrack(audioSource);

	await output.start();

	muxLogger('output started', {
		videoCodec: 'avc',
		audioCodec: 'opus',
		audioBitrate
	});

	const audioPromise = writeMixedAudio(
		audioSource,
		clips,
		assetCache,
		length - startSecondOffset,
		startSecondOffset,
		(p) => progress.setStep('audio', p)
	);

	for (let frameIndex = startFrame ?? 0; frameIndex < (endFrame ?? totalFrames); frameIndex++) {
		if (isCancelled?.()) {
			renderLogger('cancelled');
			await output.finalize();
			throw 'render cancelled';
		}

		const timestamp = frameIndex * frameDuration;
		progress.setStep('video', frameIndex - (startFrame ?? 0) / (endFrame ?? totalFrames));
		videoFrameLogger('render frame', {
			frameIndex,
			timestamp
		});

		if (frameIndex % fps === 0) {
			videoLogger('render progress', {
				frame: frameIndex,
				time: timestamp,
				percent: Math.round((frameIndex - (startFrame ?? 0) / (endFrame ?? totalFrames)) * 100)
			});
		}

		renderFrame(ctx, clips, timestamp, width, height, assetCache);

		await videoSource.add((frameIndex - (startFrame ?? 0)) * frameDuration, frameDuration);
	}
	progress.setStep('video', 100);

	await audioPromise;
	muxLogger('finalizing output');
	progress.setStep('finalize', 0, true);
	await output.finalize();
	progress.setStep('finalize', 1, true);
	muxLogger('output finalized');
	renderLogger('render complete', {
		ms: Math.round(performance.now() - renderStart)
	});
}

function renderFrame(
	ctx: OffscreenCanvasRenderingContext2D,
	clips: TimelineClip[],
	timestamp: number,
	width: number,
	height: number,
	cache: AssetCache
) {
	ctx.clearRect(0, 0, width, height);

	const active = clips
		.filter((c) => c.start <= timestamp && timestamp < c.start + c.duration)
		.filter((c) => !c.hidden)
		.sort((a, b) => a.track.localeCompare(b.track));

	for (const clip of active) {
		videoFrameClipLogger('active clip', {
			id: clip.id,
			type: clip.type,
			track: clip.track
		});
		ctx.save();

		const box = applyClipTransform(ctx, clip);
		if (!box) {
			ctx.restore();
			continue;
		}

		const { renderWidth, renderHeight } = box;

		switch (clip.type) {
			case clipType.solid:
				drawSolid(ctx, clip as SolidClip, renderWidth, renderHeight);
				break;
			case clipType.image:
				drawImage(ctx, clip as ImageClip, renderWidth, renderHeight, cache);
				break;
			case clipType.video:
				drawVideo(ctx, clip as VideoClip, timestamp, renderWidth, renderHeight, cache);
				break;
			case clipType.text:
				drawText(ctx, clip as TextClip, renderWidth, renderHeight);
				break;
		}

		ctx.restore();
	}
}

function applyClipTransform(ctx: OffscreenCanvasRenderingContext2D, clip: TimelineClip) {
	const t = clip.transform ?? defaultTransform;
	const asset = clip.asset;
	if (!asset) return;

	const renderWidth = t.width ?? asset.width!;
	const renderHeight = t.height ?? asset.height!;

	const anchorX = renderWidth * t.anchorX;
	const anchorY = renderHeight * t.anchorY;

	ctx.translate(t.x, t.y);
	ctx.translate(anchorX, anchorY);
	ctx.rotate((t.rotation * Math.PI) / 180);
	ctx.translate(-anchorX, -anchorY);
	ctx.globalAlpha *= t.opacity;

	videoFrameTransformsLogger('applied transform', {
		x: t.x,
		y: t.y,
		width: renderWidth,
		height: renderHeight,
		rotation: t.rotation
	});

	return { renderWidth, renderHeight };
}

function drawSolid(
	ctx: OffscreenCanvasRenderingContext2D,
	clip: SolidClip,
	width: number,
	height: number
) {
	videoFrameDrawLogger('drawing solid', { width, height, color: clip.color });
	ctx.fillStyle = clip.color;
	ctx.fillRect(0, 0, width, height);
}

function drawImage(
	ctx: OffscreenCanvasRenderingContext2D,
	clip: ImageClip,
	width: number,
	height: number,
	cache: AssetCache
) {
	const bmp = cache.getBitmap(clip.assetId);
	if (!bmp) return;
	videoFrameDrawLogger('drawing image', { width, height });

	const fit = clip.objectFit ?? 'contain';
	drawBitmapFitted(ctx, bmp, fit, width, height);
}

function drawVideo(
	ctx: OffscreenCanvasRenderingContext2D,
	clip: VideoClip,
	timestamp: number,
	width: number,
	height: number,
	cache: AssetCache
) {
	const video = cache.getVideo(clip.assetId);
	if (!video) return;
	videoFrameDrawLogger('drawing video', { width, height });

	const localTime = timestamp - clip.start + (clip.startTrim ?? 0);
	const rate = clip.playbackRate ?? 1;
	const targetTime = clip.reverse
		? (clip.asset.duration ?? 0) - localTime * rate
		: localTime * rate;

	if (Math.abs(video.currentTime - targetTime) > 0.04) {
		video.currentTime = targetTime;
	}

	drawBitmapFitted(ctx, video, 'contain', width, height);
}

function drawText(
	ctx: OffscreenCanvasRenderingContext2D,
	clip: TextClip,
	width: number,
	height: number
) {
	const fontSize = clip.fontSize ?? 48;
	const fontFamily = clip.fontFamily ?? 'sans-serif';
	const fontWeight = clip.fontWeight ?? 400;
	const color = clip.color ?? '#ffffff';
	const align = clip.align ?? 'center';

	videoFrameDrawLogger('drawing text', {
		width,
		height,
		fontSize,
		fontFamily,
		fontWeight,
		color,
		align
	});

	ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.textBaseline = 'middle';

	if (clip.strokeColor && clip.strokeWidth) {
		ctx.strokeStyle = clip.strokeColor;
		ctx.lineWidth = clip.strokeWidth;
		ctx.strokeText(clip.text, width / 2, height / 2);
	}

	ctx.fillText(clip.text, width / 2, height / 2);
}

function drawBitmapFitted(
	ctx: OffscreenCanvasRenderingContext2D,
	source: CanvasImageSource,
	fit: 'contain' | 'cover' | 'stretch',
	canvasW: number,
	canvasH: number
) {
	const srcW =
		(source as any).naturalWidth ?? (source as any).videoWidth ?? (source as any).width ?? canvasW;
	const srcH =
		(source as any).naturalHeight ??
		(source as any).videoHeight ??
		(source as any).height ??
		canvasH;

	if (fit === 'stretch') {
		ctx.drawImage(source, 0, 0, canvasW, canvasH);
		return;
	}

	const scaleX = canvasW / srcW;
	const scaleY = canvasH / srcH;
	const scale = fit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
	const dw = srcW * scale;
	const dh = srcH * scale;
	const dx = (canvasW - dw) / 2;
	const dy = (canvasH - dh) / 2;

	ctx.drawImage(source, dx, dy, dw, dh);
}

class AssetCache {
	private bitmaps = new Map<string, ImageBitmap>();
	private videos = new Map<string, HTMLVideoElement>();
	private audioBuffers = new Map<string, AudioBuffer>();

	async preload(clips: TimelineClip[], onProgress?: (progress01: number) => void) {
		const imageClips = clips.filter((c): c is any => c.type === clipType.image);
		const videoClips = clips.filter((c): c is any => c.type === clipType.video);
		const audioClips = clips.filter((c): c is AudioClip => c.type === clipType.audio);

		cacheLogger('preload begin', {
			images: imageClips.length,
			videos: videoClips.length,
			audio: audioClips.length
		});

		const tasks: Array<Promise<void>> = [];
		let done = 0;

		const report = () => {
			onProgress?.(tasks.length ? done / tasks.length : 1);
		};

		const addTask = (task: Promise<void>) => {
			tasks.push(
				task.finally(() => {
					done++;
					report();
				})
			);
		};

		for (const clip of imageClips) {
			if (this.bitmaps.has(clip.assetId)) continue;

			addTask(
				(async () => {
					assetLogger('loading image', {
						id: clip.assetId,
						name: clip.asset.name
					});
					try {
						const resp = await fetch(clip.asset.objectUrl);
						const blob = await resp.blob();
						const bmp = await createImageBitmap(blob);
						this.bitmaps.set(clip.assetId, bmp);
						assetLogger('image loaded', {
							id: clip.assetId,
							width: bmp.width,
							height: bmp.height
						});
					} catch (e) {
						assetLogger.error('image load failed', {
							id: clip.assetId,
							error: e
						});
					}
				})()
			);
		}

		for (const clip of videoClips) {
			if (this.videos.has(clip.assetId)) continue;

			addTask(
				(async () => {
					videoLogger('loading video', {
						id: clip.assetId,
						name: clip.asset.name
					});
					try {
						const video = document.createElement('video');
						video.src = clip.asset.objectUrl;
						video.preload = 'auto';
						video.muted = true;

						await new Promise<void>((res, rej) => {
							video.oncanplaythrough = () => res();
							video.onerror = () => rej(new Error(`Video load failed: ${clip.assetId}`));
							video.load();
						});

						this.videos.set(clip.assetId, video);

						if (!this.audioBuffers.has(clip.assetId)) {
							audioLogger('extracting video audio', {
								id: clip.assetId
							});
							const buffer = await decodeAssetToAudioBuffer(clip.asset);

							if (buffer) {
								this.audioBuffers.set(clip.assetId, buffer);
								audioLogger('video audio decoded', {
									id: clip.assetId,
									duration: buffer.duration,
									sampleRate: buffer.sampleRate,
									channels: buffer.numberOfChannels
								});
							}
						}

						videoLogger('video ready', {
							id: clip.assetId,
							duration: video.duration,
							width: video.videoWidth,
							height: video.videoHeight
						});
					} catch (e) {
						videoLogger.error('video load failed', {
							id: clip.assetId,
							error: e
						});
					}
				})()
			);
		}

		for (const clip of audioClips) {
			if (this.audioBuffers.has(clip.assetId)) continue;

			addTask(
				(async () => {
					try {
						const buffer = await decodeAssetToAudioBuffer(clip.asset);
						if (buffer) this.audioBuffers.set(clip.assetId, buffer);
					} catch (e) {
						console.warn('[AssetCache] Failed to load audio', clip.assetId, e);
					}
				})()
			);
		}

		report();
		await Promise.all(tasks);
		report();
	}

	getBitmap(assetId: string) {
		return this.bitmaps.get(assetId) ?? null;
	}

	getVideo(assetId: string) {
		return this.videos.get(assetId) ?? null;
	}

	getAudioBuffer(assetId: string) {
		return this.audioBuffers.get(assetId) ?? null;
	}

	dispose() {
		for (const bmp of this.bitmaps.values()) bmp.close();
		this.bitmaps.clear();
		this.videos.clear();
		this.audioBuffers.clear();
	}
}

type WrappedAudioBuffer = {
	buffer: AudioBuffer;
	timestamp: number;
	duration: number;
};

async function decodeAssetToAudioBuffer(asset: AudioClip['asset']): Promise<AudioBuffer | null> {
	const start = performance.now();
	audioLogger('decode begin', {
		name: asset.name,
		type: asset.type
	});
	const input = new Input({
		source: new BlobSource(await getAssetFile(asset)),
		formats: ALL_FORMATS
	});

	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) return null;
		audioLogger('audio track found', {
			codec: track.getCodec()
		});

		const sink = new AudioBufferSink(track);
		const segments: WrappedAudioBuffer[] = [];

		for await (const seg of sink.buffers()) {
			audioLogger('segment received', {
				timestamp: seg.timestamp,
				duration: seg.duration,
				length: seg.buffer.length
			});
			segments.push(seg);
		}

		if (!segments.length) return null;
		audioLogger('decode complete', {
			segments: segments.length,
			ms: Math.round(performance.now() - start)
		});
		return await concatWrappedAudioBuffers(segments);
	} finally {
		input.dispose?.();
	}
}

async function concatWrappedAudioBuffers(segments: WrappedAudioBuffer[]): Promise<AudioBuffer> {
	const first = segments[0];
	let targetSampleRate = first.buffer.sampleRate;
	let numberOfChannels = first.buffer.numberOfChannels;

	const normalized: WrappedAudioBuffer[] = [];

	for (const seg of segments) {
		let buffer = seg.buffer;

		if (buffer.sampleRate !== targetSampleRate) {
			audioLogger('resampling buffer', {
				from: buffer.sampleRate,
				to: targetSampleRate,
				duration: buffer.duration
			});
			buffer = await resampleAudioBuffer(buffer, targetSampleRate);
		}

		if (buffer.numberOfChannels !== numberOfChannels) {
			numberOfChannels = Math.max(numberOfChannels, buffer.numberOfChannels);
		}

		normalized.push({
			buffer,
			timestamp: seg.timestamp,
			duration: buffer.duration
		});
	}

	let endTime = 0;
	for (const seg of normalized) {
		endTime = Math.max(endTime, seg.timestamp + seg.duration);
	}

	const length = Math.ceil(endTime * targetSampleRate);
	const out = new AudioBuffer({
		length,
		numberOfChannels,
		sampleRate: targetSampleRate
	});

	for (const seg of normalized) {
		const startFrame = Math.round(seg.timestamp * targetSampleRate);
		const buf = seg.buffer;
		const frames = Math.min(buf.length, length - startFrame);

		for (let ch = 0; ch < numberOfChannels; ch++) {
			const dest = out.getChannelData(ch);
			const srcCh = Math.min(ch, buf.numberOfChannels - 1);
			const src = buf.getChannelData(srcCh);
			dest.set(src.subarray(0, frames), startFrame);
		}
	}
	audioLogger('audio buffer assembled', {
		segments: normalized.length,
		length,
		duration: out.duration,
		sampleRate: out.sampleRate,
		channels: out.numberOfChannels
	});
	return out;
}

async function resampleAudioBuffer(
	buffer: AudioBuffer,
	targetSampleRate: number
): Promise<AudioBuffer> {
	if (buffer.sampleRate === targetSampleRate) return buffer;

	const length = Math.max(1, Math.ceil(buffer.duration * targetSampleRate));
	const offline = new OfflineAudioContext(buffer.numberOfChannels, length, targetSampleRate);
	const source = offline.createBufferSource();

	source.buffer = buffer;
	source.connect(offline.destination);
	source.start();

	return await offline.startRendering();
}

function sampleLinear(buffer: AudioBuffer, channel: number, timeSec: number): number {
	const sr = buffer.sampleRate;
	const pos = timeSec * sr;

	if (pos < 0 || pos > buffer.length - 1) return 0;

	const i0 = Math.floor(pos);
	const i1 = Math.min(i0 + 1, buffer.length - 1);
	const frac = pos - i0;

	const ch = Math.min(channel, buffer.numberOfChannels - 1);
	const data = buffer.getChannelData(ch);

	const a = data[i0] ?? 0;
	const b = data[i1] ?? a;

	return a + (b - a) * frac;
}

async function writeMixedAudio(
	audioSource: AudioSampleSource,
	clips: TimelineClip[],
	cache: AssetCache,
	length: number,
	startOffset = 0,
	onProgress?: (progress01: number) => void
) {
	const mixRate = 44100;
	const channels = 2;
	const blockFrames = 2048;
	const totalFrames = Math.ceil(length * mixRate);

	if (startOffset !== 0) {
		// forgive me
		clips = clips.map((c) => ({ ...c, start: c.start - startOffset }));
	}

	const sources = (
		await Promise.all(
			clips
				.filter(
					(c): c is AudioClip | VideoClip => c.type === clipType.audio || c.type === clipType.video
				)
				.map(async (clip) => ({
					clip,
					buffer: cache.getAudioBuffer(clip.assetId)
				}))
		)
	).filter((src) => {
		audioLogger('source registered', {
			id: src.clip.id,
			type: src.clip.type,
			duration: src.clip.duration,
			bufferDuration: src.buffer?.duration
		});
		if (!src.buffer)
			audioLogger.warn('missing audio buffer', {
				id: src.clip.assetId
			});
		return !!src.buffer;
	}) as Array<{ clip: AudioClip; buffer: AudioBuffer }>;
	audioLogger('mix begin', {
		length,
		mixRate,
		totalFrames,
		sources: sources.length
	});
	const totalBlocks = Math.ceil(totalFrames / blockFrames);
	let completedBlocks = 0;
	const report = () => onProgress?.(totalBlocks ? completedBlocks / totalBlocks : 1);
	for (let blockStartFrame = 0; blockStartFrame < totalFrames; blockStartFrame += blockFrames) {
		const frameCount = Math.min(blockFrames, totalFrames - blockStartFrame);
		const mix = new Float32Array(frameCount * channels);

		const blockStartTime = blockStartFrame / mixRate;
		const blockEndTime = (blockStartFrame + frameCount) / mixRate;

		for (const src of sources) {
			const clip = src.clip;
			const buffer = src.buffer;

			const clipStart = clip.start;

			const clipEnd = clip.start + clip.duration;

			if (clipEnd <= blockStartTime || clipStart >= blockEndTime) continue;

			const assetDuration = clip.asset.duration ?? buffer.duration;

			const {
				pan = 0,
				gain = 0,
				reverse = false,
				volume = 1,
				muted = false,
				playbackRate = 1,
				startTrim = 0
			} = clip;

			if (muted) {
				audioLogger('muted source skipped', {
					id: clip.id
				});
				continue;
			}

			const overlapStartFrame = Math.max(blockStartFrame, Math.floor(clipStart * mixRate));
			const overlapEndFrame = Math.min(blockStartFrame + frameCount, Math.ceil(clipEnd * mixRate));

			for (let outFrame = overlapStartFrame; outFrame < overlapEndFrame; outFrame++) {
				const timelineTime = outFrame / mixRate;
				const localTime = timelineTime - clipStart;

				const sourceTime = reverse
					? assetDuration - startTrim - localTime * playbackRate
					: startTrim + localTime * playbackRate;

				const dst = (outFrame - blockStartFrame) * channels;

				const amp = volume * Math.pow(10, gain / 20);

				const leftPan = Math.cos(((pan + 1) * Math.PI) / 4);
				const rightPan = Math.sin(((pan + 1) * Math.PI) / 4);

				const leftSample = sampleLinear(buffer, 0, sourceTime) * amp * leftPan;
				const rightSample = sampleLinear(buffer, 1, sourceTime) * amp * rightPan;

				mix[dst + 0] += leftSample;
				mix[dst + 1] += rightSample;
			}
		}

		let clippedSamples = 0;

		for (let i = 0; i < mix.length; i++) {
			if (mix[i] > 1 || mix[i] < -1) {
				clippedSamples++;
			}

			mix[i] = Math.max(-1, Math.min(1, mix[i]));
		}

		if (clippedSamples > 0) {
			audioLogger.warn('audio clipping detected', {
				blockStartTime,
				clippedSamples
			});
		}

		const audioBuffer = new AudioBuffer({
			length: frameCount,
			numberOfChannels: channels,
			sampleRate: mixRate
		});

		for (let ch = 0; ch < channels; ch++) {
			const out = audioBuffer.getChannelData(ch);
			for (let f = 0; f < frameCount; f++) {
				out[f] = mix[f * channels + ch];
			}
		}

		const samples = AudioSample.fromAudioBuffer(audioBuffer, blockStartTime);

		for (const sample of samples) {
			try {
				await audioSource.add(sample);
			} finally {
				sample.close();
			}
		}
		completedBlocks++;
		report();
	}
	audioLogger('mix complete', {
		totalFrames
	});
	onProgress?.(1);
}

export interface AudioEncoderSupport {
	codec: string;
	sampleRate: number;
	channels: number;
	bitrate: number;
	supported: boolean;
}

export async function probeAudioEncoders(): Promise<AudioEncoderSupport[]> {
	if (typeof AudioEncoder === 'undefined') {
		return [];
	}

	const codecs = ['mp4a.40.2', 'opus', 'flac', 'pcm-f32', 'pcm-s16'];

	const sampleRates = [44100, 48000];
	const channels = [1, 2];
	const bitrates = [64000, 96000, 128000, 192000, 256000];

	const results: AudioEncoderSupport[] = [];

	for (const codec of codecs) {
		for (const sampleRate of sampleRates) {
			for (const numberOfChannels of channels) {
				for (const bitrate of bitrates) {
					try {
						const support = await AudioEncoder.isConfigSupported({
							codec,
							sampleRate,
							numberOfChannels,
							bitrate
						});

						results.push({
							codec,
							sampleRate,
							channels: numberOfChannels,
							bitrate,
							supported: support.supported ?? false
						});
					} catch {
						results.push({
							codec,
							sampleRate,
							channels: numberOfChannels,
							bitrate,
							supported: false
						});
					}
				}
			}
		}
	}

	return results;
}
