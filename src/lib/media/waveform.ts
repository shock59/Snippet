import * as MP4Box from 'mp4box';

export const resolution = 100;

export interface WaveformResult {
	waveform: Float32Array;

	duration: number;
	sampleRate: number;

	channels: number;

	pointsPerSecond: number;
}

class PeakAccumulator {
	readonly sampleRate: number;
	readonly channels: number;
	readonly pointsPerSecond: number;
	private readonly samplesPerPoint: number;

	private windowPeak = 0;
	private windowCount = 0;

	readonly points: number[] = [];

	totalFrames = 0;

	constructor(sampleRate: number, channels: number, pointsPerSecond: number) {
		if (sampleRate <= 0) throw new RangeError(`Invalid sample rate: ${sampleRate}`);
		this.sampleRate = sampleRate;
		this.channels = channels;
		this.pointsPerSecond = pointsPerSecond;
		this.samplesPerPoint = Math.max(1, Math.round(sampleRate / pointsPerSecond));
	}

	feedInterleaved(samples: Float32Array): void {
		const frames = Math.floor(samples.length / this.channels);
		for (let i = 0; i < frames; i++) {
			let peak = 0;
			for (let c = 0; c < this.channels; c++) {
				peak = Math.max(peak, Math.abs(samples[i * this.channels + c]));
			}
			this.advance(peak);
		}
	}

	feedPlanar(planes: Float32Array[], numFrames: number): void {
		for (let i = 0; i < numFrames; i++) {
			let peak = 0;
			for (const plane of planes) {
				peak = Math.max(peak, Math.abs(plane[i]));
			}
			this.advance(peak);
		}
	}

	flush(): void {
		if (this.windowCount > 0) {
			this.points.push(this.windowPeak);
			this.windowPeak = 0;
			this.windowCount = 0;
		}
	}

	toFloat32Array(): Float32Array {
		return new Float32Array(this.points);
	}

	private advance(framePeak: number): void {
		this.windowPeak = Math.max(this.windowPeak, framePeak);
		this.windowCount++;
		this.totalFrames++;

		if (this.windowCount >= this.samplesPerPoint) {
			this.points.push(this.windowPeak);
			this.windowPeak = 0;
			this.windowCount = 0;
		}
	}
}

async function extractWaveformWAV(
	stream: ReadableStream<Uint8Array>,
	pps: number,
	onProgress?: (p: number) => void,
	fileSize?: number
): Promise<WaveformResult> {
	const reader = stream.getReader();

	let buf = new Uint8Array(0);
	let headerParsed = false;

	let audioFormat = 0;
	let channels = 0;
	let sampleRate = 0;
	let bitDepth = 0;
	let dataRemaining = Infinity;

	let acc: PeakAccumulator | null = null;
	let bytesRead = 0;

	const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
	const u32 = (b: Uint8Array, o: number): number =>
		((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000) >>> 0;

	const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
		const out = new Uint8Array(a.length + b.length);
		out.set(a);
		out.set(b, a.length);
		return out;
	};

	while (true) {
		const { done, value } = await reader.read();

		if (value) {
			buf = concat(buf, value) as any;
			bytesRead += value.length;
			if (fileSize) onProgress?.(bytesRead / fileSize);
		}

		if (!headerParsed) {
			if (buf.length < 12) {
				if (done) throw new Error('WAV: file is too short');
				continue;
			}

			if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46)
				throw new Error('WAV: not a RIFF file');
			if (buf[8] !== 0x57 || buf[9] !== 0x41 || buf[10] !== 0x56 || buf[11] !== 0x45)
				throw new Error('WAV: RIFF type is not WAVE');

			let cursor = 12;
			let fmtFound = false;

			outer: while (cursor + 8 <= buf.length) {
				const id =
					((buf[cursor] << 24) |
						(buf[cursor + 1] << 16) |
						(buf[cursor + 2] << 8) |
						buf[cursor + 3]) >>>
					0;
				const sz = u32(buf, cursor + 4);

				switch (id) {
					case 0x666d7420: {
						if (cursor + 8 + sz > buf.length) break outer;

						audioFormat = u16(buf, cursor + 8);
						channels = u16(buf, cursor + 10);
						sampleRate = u32(buf, cursor + 12);
						bitDepth = u16(buf, cursor + 22);

						if (audioFormat === 0xfffe && sz >= 40) {
							audioFormat = u16(buf, cursor + 8 + 24);
							bitDepth = u16(buf, cursor + 8 + 18);
						}

						fmtFound = true;
						cursor += 8 + sz + (sz & 1);
						break;
					}

					case 0x64617461: {
						if (!fmtFound) throw new Error('WAV: data chunk before fmt chunk');
						dataRemaining = sz === 0 ? Infinity : sz;
						buf = buf.slice(cursor + 8);
						headerParsed = true;
						acc = new PeakAccumulator(sampleRate, channels, pps);
						break outer;
					}

					default:
						cursor += 8 + sz + (sz & 1);
				}
			}

			if (!headerParsed) {
				if (done) throw new Error('WAV: data chunk not found');
				continue;
			}
		}

		if (acc) {
			const bytesPerSample = bitDepth >> 3;
			const bytesPerFrame = bytesPerSample * channels;
			const available = Math.min(buf.length, dataRemaining);
			const frames = Math.floor(available / bytesPerFrame);

			if (frames > 0) {
				const pcmBytes = frames * bytesPerFrame;
				const f32 = new Float32Array(frames * channels);
				const dv = new DataView(buf.buffer, buf.byteOffset, pcmBytes);

				for (let i = 0; i < frames * channels; i++) {
					const o = i * bytesPerSample;
					if (audioFormat === 3) {
						f32[i] = bitDepth === 64 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
					} else {
						switch (bitDepth) {
							case 8:
								f32[i] = (dv.getUint8(o) - 128) / 128;
								break;
							case 16:
								f32[i] = dv.getInt16(o, true) / 32_768;
								break;
							case 24: {
								const b0 = dv.getUint8(o),
									b1 = dv.getUint8(o + 1),
									b2 = dv.getInt8(o + 2);
								f32[i] = ((b2 << 16) | (b1 << 8) | b0) / 8_388_608;
								break;
							}
							case 32:
								f32[i] = dv.getInt32(o, true) / 2_147_483_648;
								break;
						}
					}
				}

				acc.feedInterleaved(f32);
				dataRemaining -= pcmBytes;
				buf = buf.slice(pcmBytes);
			}
		}

		if (done) break;
	}

	reader.releaseLock();

	if (!acc) throw new Error('WAV: could not parse header');
	acc.flush();

	return {
		waveform: acc.toFloat32Array(),
		duration: acc.totalFrames / sampleRate,
		sampleRate,
		channels,
		pointsPerSecond: pps
	};
}

function extractESDescription(mp4: unknown, trackId: number): Uint8Array | undefined {
	try {
		const trak: any = (mp4 as any).getTrackById(trackId);
		const entry: unknown = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
		if (!entry) return undefined;

		const esds: any = (entry as any)?.esds ?? (entry as any)?.mp4a?.esds;
		if (!esds) return undefined;

		for (const desc of (esds?.esd?.descs ?? []) as any[]) {
			for (const sub of (desc?.descs ?? []) as any[]) {
				const raw: number[] | undefined = sub?.data ?? sub?.decSpecificInfo?.data;
				if (raw?.length) return new Uint8Array(raw);
			}
		}
		return undefined;
	} catch {
		return undefined;
	}
}

async function extractWaveformMP4(
	stream: ReadableStream<Uint8Array>,
	pps: number,
	onProgress?: (p: number) => void,
	fileSize?: number
): Promise<WaveformResult> {
	return new Promise<WaveformResult>((resolve, reject) => {
		const mp4: any = MP4Box.createFile();

		let acc: PeakAccumulator | null = null;
		let decoder: AudioDecoder | null = null;
		let audioTrackId = -1;
		let sampleRate = 0;
		let channels = 0;
		let duration = 0;
		let settled = false;

		const fail = (e: unknown): void => {
			if (settled) return;
			settled = true;
			reject(e instanceof Error ? e : new Error(String(e)));
		};

		const finish = async (): Promise<void> => {
			if (settled) return;
			if (!decoder || !acc) return fail(new Error('MP4: no audio track found'));
			try {
				await decoder.flush();
				acc.flush();
				decoder.close();
				settled = true;
				resolve({
					waveform: acc.toFloat32Array(),
					duration: duration || acc.totalFrames / sampleRate,
					sampleRate,
					channels,
					pointsPerSecond: pps
				});
			} catch (e) {
				fail(e);
			}
		};

		mp4.onReady = (info: any): void => {
			try {
				const track = (info.tracks as any[]).find((t: any) => t.type === 'audio');
				if (!track) return fail(new Error('MP4: file contains no audio track'));

				audioTrackId = track.id;
				sampleRate = track.audio.sample_rate;
				channels = track.audio.channel_count;
				duration = track.duration / track.timescale;

				acc = new PeakAccumulator(sampleRate, channels, pps);

				decoder = new AudioDecoder({
					output(ad: AudioData) {
						if (!acc) {
							ad.close();
							return;
						}
						const n = ad.numberOfFrames;
						const nCh = ad.numberOfChannels;
						const planes: Float32Array[] = Array.from({ length: nCh }, (_, c) => {
							const p = new Float32Array(n);
							ad.copyTo(p, { planeIndex: c, format: 'f32-planar' });
							return p;
						});
						acc.feedPlanar(planes, n);
						ad.close();

						if (onProgress && duration > 0) {
							onProgress(Math.min(1, acc.totalFrames / sampleRate / duration));
						}
					},
					error: fail
				});

				const codecConfig: AudioDecoderConfig = {
					codec: track.codec as string,
					sampleRate,
					numberOfChannels: channels
				};

				const description = extractESDescription(mp4, audioTrackId);
				if (description) codecConfig.description = description;

				decoder.configure(codecConfig);

				mp4.setExtractionOptions(audioTrackId, null, { nbSamples: 1000 });
				mp4.start();
			} catch (e) {
				fail(e);
			}
		};

		mp4.onSamples = (id: number, _user: unknown, samples: any[]): void => {
			if (id !== audioTrackId || settled || !decoder) return;
			for (const s of samples) {
				try {
					decoder.decode(
						new EncodedAudioChunk({
							type: s.is_sync ? 'key' : 'delta',
							timestamp: Math.round((s.cts / s.timescale) * 1_000_000), 
							duration: Math.round((s.duration / s.timescale) * 1_000_000),
							data: s.data as ArrayBuffer
						})
					);
				} catch (e) {
					fail(e);
					return;
				}
			}
		};

		mp4.onError = (msg: string) => fail(new Error(`mp4box: ${msg}`));

		(async () => {
			const reader = stream.getReader();
			let offset = 0;
			let bytesRead = 0;
			try {
				for (;;) {
					const { done, value } = await reader.read();

					if (value) {
						const ab = value.buffer.slice(
							value.byteOffset,
							value.byteOffset + value.byteLength
						) as ArrayBuffer & { fileStart: number };
						ab.fileStart = offset;

						mp4.appendBuffer(ab);
						offset += value.byteLength;
						bytesRead += value.byteLength;
						if (fileSize) onProgress?.(bytesRead / fileSize);
					}

					if (done) {
						mp4.flush();
						await finish();
						break;
					}
				}
			} catch (e) {
				fail(e);
			} finally {
				reader.releaseLock();
			}
		})();
	});
}

async function extractWaveformFallback(
	stream: ReadableStream<Uint8Array>,
	pps: number,
	onProgress?: (p: number) => void,
	fileSize?: number
): Promise<WaveformResult> {
	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (value) {
				chunks.push(value);
				total += value.length;
				if (fileSize) onProgress?.((0.5 * total) / fileSize);
			}
			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}

	const raw = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		raw.set(c, off);
		off += c.length;
	}

	const ctx = new OfflineAudioContext(2, 44100, 44100);
	const audioBuffer = await ctx.decodeAudioData(raw.buffer);

	const sampleRate = audioBuffer.sampleRate;
	const channels = audioBuffer.numberOfChannels;
	const duration = audioBuffer.duration;
	const nFrames = audioBuffer.length;

	const acc = new PeakAccumulator(sampleRate, channels, pps);

	const chanData = Array.from({ length: channels }, (_, c) => audioBuffer.getChannelData(c));

	const BLOCK = 8192;
	for (let start = 0; start < nFrames; start += BLOCK) {
		const end = Math.min(start + BLOCK, nFrames);
		acc.feedPlanar(
			chanData.map((ch) => ch.subarray(start, end)),
			end - start
		);
		onProgress?.(0.5 + 0.5 * (end / nFrames));
	}

	acc.flush();

	return {
		waveform: acc.toFloat32Array(),
		duration,
		sampleRate,
		channels,
		pointsPerSecond: pps
	};
}

export async function extractWaveform(
	stream: ReadableStream<Uint8Array>,
	mimeType: string,
	fileSize?: number,
	options?: {
		pointsPerSecond?: number;
		onProgress?: (progress: number) => void;
	}
): Promise<WaveformResult> {
	const pps = options?.pointsPerSecond ?? resolution;
	const onProgress = options?.onProgress;

	const type = mimeType
		.toLowerCase()
		.replace(/\s*;.*$/, '')
		.trim();

	if (/^audio\/(wav|wave|x-wav|vnd\.wave)$/.test(type)) {
		return extractWaveformWAV(stream, pps, onProgress, fileSize);
	}

	const hasWebCodecs =
		typeof AudioDecoder !== 'undefined' && typeof EncodedAudioChunk !== 'undefined';

	if (
		hasWebCodecs &&
		/^(audio\/(mp4|m4a|aac|x-m4a)|video\/(mp4|quicktime|x-m4v|3gpp|3gpp2))$/.test(type)
	) {
		return extractWaveformMP4(stream, pps, onProgress, fileSize);
	}

	return extractWaveformFallback(stream, pps, onProgress, fileSize);
}

export function extractWaveformFromFile(
	file: File,
	options?: Parameters<typeof extractWaveform>[3]
): Promise<WaveformResult> {
	return extractWaveform(file.stream(), file.type, file.size, options);
}
