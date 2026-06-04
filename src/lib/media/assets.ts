import { writable, get } from 'svelte/store';
import { clipType, type MediaAsset } from './types';
import { createLogger } from '$lib/debug';
import promptFor from '$lib/popups';
import { browser } from '$app/environment';
import { OPFS, type ByteWriter } from './OPFS';
import { formatBytes } from '$lib/utils';
import {
	ZipWriter,
	ZipReader,
	BlobReader,
	BlobWriter,
	type FileEntry,
	configure
} from '@zip.js/zip.js';
import { extractWaveformFromFile } from './waveform';

const video: HTMLVideoElement = browser ? document.createElement('video') : (null as any);

configure({
	chunkSize: 32 * 1024 * 1024
});

const mediaLogger = createLogger('media');
const mediaPreviewLogger = mediaLogger.child('previews');
const mediaProjectExportLogger = mediaLogger.child('export');
const mediaProjectImportLogger = mediaLogger.child('import');

type State = {
	assets: Record<string, MediaAsset>;
};

const state = writable<State>({
	assets: {}
});

async function extractMetadata(asset: MediaAsset) {
	const file = await getAssetFile(asset);

	if (asset.type.startsWith('image/')) {
		const bitmap = await createImageBitmap(file);

		asset.width = bitmap.width;
		asset.height = bitmap.height;

		asset.previewUrl = asset.objectUrl;

		return;
	}

	if (asset.type.startsWith('video/')) {
		await new Promise<void>((resolve) => {
			video.preload = 'metadata';
			video.src = asset.objectUrl;

			video.onloadedmetadata = async () => {
				asset.duration = video.duration;

				if (!Number.isFinite(video.duration)) {
					video.currentTime = 99999999999;

					await new Promise<void>((resolve) => {
						video.onseeked = () => {
							asset.duration = video.currentTime;
							resolve();
						};
					});
				}

				asset.width = video.videoWidth;
				asset.height = video.videoHeight;

				const thumb = await frameRenderer.frame(file, video.duration / 2);

				asset.previewUrl = thumb.url;

				resolve();
			};
		});

		return;
	}

	if (asset.type.startsWith('audio/')) {
		const audio = document.createElement('audio');

		audio.preload = 'metadata';
		audio.src = asset.objectUrl;

		await new Promise<void>((resolve, reject) => {
			audio.onloadedmetadata = () => {
				asset.duration = audio.duration;
				resolve();
			};

			audio.onerror = () => reject(audio.error);
		});
	}

	if (asset.type.startsWith('audio/') || asset.type.startsWith('video/')) {
		console.log('extracting');
		const result = await extractWaveformFromFile(file, {
			onProgress: (p) => console.log(`Waveform: ${(p * 100).toFixed(0)}%`)
		});
		asset.waveform = result.waveform;
	}
}

export type BundleManifest = {
	version: 1;
	name: string;
	assets: Array<{
		id: string;
		name: string;
		type: string;
		size: number;
		width?: number;
		height?: number;
		duration?: number;
	}>;
};

function revokeAllCurrentAssets() {
	state.update((s) => {
		for (const asset of Object.values(s.assets)) {
			URL.revokeObjectURL(asset.objectUrl);
		}
		return { assets: {} };
	});
}

export async function readBundleManifest(blob: Blob): Promise<BundleManifest> {
	const zipReader = new ZipReader(new BlobReader(blob));
	try {
		const entries = await zipReader.getEntries();
		const fileEntries = entries.filter((e): e is FileEntry => !e.directory);
		const manifestEntry = fileEntries.find((e) => e.filename === 'project.json');
		if (!manifestEntry) throw new Error('Bundle is missing project.json');
		const manifestBlob = await manifestEntry.getData(new BlobWriter());
		return JSON.parse(await manifestBlob.text()) as BundleManifest;
	} finally {
		await zipReader.close();
	}
}

export async function writeBundleToOPFS(
	blob: Blob,
	root = '/bundle-temp'
): Promise<BundleManifest> {
	const zipReader = new ZipReader(new BlobReader(blob), { useWebWorkers: true });

	try {
		const entries = await zipReader.getEntries();
		const fileEntries = entries.filter((e): e is FileEntry => !e.directory);
		mediaProjectImportLogger('found', fileEntries.length, 'file entries in bundle');

		const manifestEntry = fileEntries.find((e) => e.filename === 'project.json');
		if (!manifestEntry) throw new Error('Bundle is missing project.json manifest');

		const manifestBlob = await manifestEntry.getData(new BlobWriter());
		const manifest = JSON.parse(await manifestBlob.text()) as BundleManifest;

		for (const entry of fileEntries) {
			// if (entry.filename === 'project.json') continue;

			const outPath = `${root}/${entry.filename}`;
			mediaProjectImportLogger('extracting', entry.filename);

			const opfsWriter = await OPFS.writer(outPath, { create: true });

			const writableStream = new WritableStream<Uint8Array>({
				write: (chunk) => opfsWriter.write(chunk),
				close: () => opfsWriter.close()
			});

			await entry.getData(writableStream);
			mediaProjectImportLogger('extracted', entry.filename, 'to', outPath);
		}

		return manifest;
	} finally {
		await zipReader.close();
	}
}

export async function getAssetFile(asset: MediaAsset) {
	const handle = await OPFS.fileHandle(asset.path);
	return handle.getFile();
}

export async function getAssetPathFile(path: string) {
	const handle = await OPFS.fileHandle(path);
	return await handle.getFile();
}

export async function getAssetStream(asset: MediaAsset) {
	return await OPFS.readStream(asset.path);
}

export function mimeToClipType(mime: string) {
	if (mime.startsWith('image/')) {
		return clipType.image;
	}

	if (mime.startsWith('video/')) {
		return clipType.video;
	}

	if (mime.startsWith('audio/')) {
		return clipType.audio;
	}
	return null;
}

export const media = {
	subscribe: state.subscribe,

	get assets() {
		return get(state).assets;
	},

	async import(files: FileList | File[]) {
		mediaLogger('importing', files.length, 'files');

		for (const file of Array.from(files)) {
			const id = crypto.randomUUID();

			let name = file.name;

			const existing = Object.values(this.assets).find((f) => f.name === name.trim());

			if (existing) {
				const { value } = await promptFor('textInputPrompt', {
					title: 'Asset name conflict',
					description: `An asset with the name ${name} already exists.`,
					cancelText: 'Skip asset',

					valid(v) {
						const existing = Object.values(media.assets).find((f) => f.name === v.trim());

						return !existing && !!v;
					},

					default: name
				}).catch(() => ({
					value: null
				}));

				if (!value) continue;

				name = value;
			}

			const path = `/assets/${id}`;

			mediaLogger('writing asset to OPFS', name, formatBytes(file.size));

			await OPFS.write(path, file.stream(), {
				create: true
			});

			const storedFile = await (await OPFS.fileHandle(path)).getFile();

			const asset: MediaAsset = {
				id,

				path,

				objectUrl: URL.createObjectURL(storedFile),

				name: name.trim(),

				type: file.type,
				size: file.size
			};

			await extractMetadata(asset);

			mediaLogger('imported asset', asset);

			state.update((s) => {
				s.assets[id] = asset;
				return s;
			});
		}
	},

	async openProject(manifest: BundleManifest): Promise<void> {
		revokeAllCurrentAssets();

		for (const meta of manifest.assets) {
			const path = `/assets/${meta.id}`;
			const assetFile = await getAssetPathFile(path);

			if (!assetFile.size) {
				mediaProjectImportLogger.warn('asset exists but is empty', path);
			}

			const asset: MediaAsset = {
				id: meta.id,
				path,
				objectUrl: URL.createObjectURL(assetFile),
				name: meta.name,
				type: meta.type,
				size: assetFile.size,
				width: meta.width,
				height: meta.height,
				duration: meta.duration,
				previewUrl: undefined
			};

			if (asset.type.startsWith('image/')) {
				asset.previewUrl = asset.objectUrl;
			} else if (asset.type.startsWith('video/')) {
				void frameRenderer
					.frame(await getAssetFile(asset), Math.max(0, (asset.duration ?? 0) / 2))
					.then((thumb) => {
						state.update((s) => {
							const current = s.assets[asset.id];
							if (!current) return s;
							current.previewUrl = thumb.url;
							return s;
						});
					})
					.catch((err) => {
						mediaProjectImportLogger.warn('thumbnail generation failed', err);
					});
			}

			mediaProjectImportLogger('loaded asset', asset.name);
			state.update((s) => {
				s.assets[asset.id] = asset;
				return s;
			});
		}
	},

	remove(id: string) {
		state.update((s) => {
			const asset = s.assets[id];

			if (asset) {
				URL.revokeObjectURL(asset.objectUrl);
			}

			delete s.assets[id];

			return s;
		});
	}
};

class FrameRenderer {
	video: HTMLVideoElement;

	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;

	currentFile?: File;
	currentUrl?: string;

	constructor() {
		if (!browser) {
			this.video = null as any;
			this.canvas = null as any;
			this.ctx = null as any;
			return;
		}
		mediaPreviewLogger('creating thumbnail generator');

		this.video = document.createElement('video');

		this.video.muted = true;
		this.video.playsInline = true;
		this.video.preload = 'auto';

		this.canvas = document.createElement('canvas');

		const ctx = this.canvas.getContext('2d');

		if (!ctx) {
			mediaPreviewLogger.error('failed to get 2d canvas context');
			throw new Error('2d context unavailable');
		}

		this.ctx = ctx;

		this.video.onerror = () => {
			mediaPreviewLogger.error('video element error', this.video.error);
		};
	}

	private async loadFile(file: File) {
		if (this.currentFile === file) {
			mediaPreviewLogger('reusing loaded file', file.name);
			return;
		}

		mediaPreviewLogger('loading file', {
			name: file.name,
			size: file.size,
			type: file.type
		});

		if (this.currentUrl) {
			URL.revokeObjectURL(this.currentUrl);
		}

		this.currentFile = file;

		const url = URL.createObjectURL(file);

		this.currentUrl = url;

		this.video.src = url;

		await new Promise<void>((resolve, reject) => {
			this.video.onloadedmetadata = async () => {
				mediaPreviewLogger('loaded metadata', {
					duration: this.video.duration,
					width: this.video.videoWidth,
					height: this.video.videoHeight
				});

				if (!Number.isFinite(this.video.duration)) {
					mediaPreviewLogger.warn('video duration is infinite');
					this.video.currentTime = 999999999;

					await new Promise<void>((resolve) => {
						this.video.onseeked = () => {
							mediaPreviewLogger('true length', this.video.currentTime);
							resolve();
						};
					});
				}

				resolve();
			};

			this.video.onerror = () => {
				reject(this.video.error);
			};
		});
	}

	async frame(
		file: File,
		timestamp: number,
		options?: {
			width?: number;
			height?: number;
			type?: string;
			quality?: number;
		}
	) {
		try {
			const { width, height, type = 'image/jpeg', quality = 0.7 } = options ?? {};

			mediaPreviewLogger('generating frame', {
				timestamp,
				width,
				height,
				type,
				quality
			});

			await this.loadFile(file);

			let clampedTimestamp = Math.min(Math.max(timestamp, 0), this.video.duration || timestamp);
			if (!Number.isFinite(clampedTimestamp)) clampedTimestamp = 0;
			mediaPreviewLogger('seeking', clampedTimestamp);

			this.video.currentTime = clampedTimestamp;

			await new Promise<void>((resolve) => {
				this.video.onseeked = () => {
					mediaPreviewLogger('seeked', clampedTimestamp);
					resolve();
				};
			});

			const targetWidth = width ?? this.video.videoWidth;

			const targetHeight =
				height ?? Math.round(targetWidth * (this.video.videoHeight / this.video.videoWidth));

			this.canvas.width = targetWidth;
			this.canvas.height = targetHeight;

			mediaPreviewLogger('drawing frame', {
				targetWidth,
				targetHeight
			});

			this.ctx.clearRect(0, 0, targetWidth, targetHeight);

			this.ctx.drawImage(this.video, 0, 0, targetWidth, targetHeight);

			const blob = await new Promise<Blob>((resolve, reject) => {
				this.canvas.toBlob(
					(blob) => {
						if (blob) {
							resolve(blob);
						} else {
							reject(new Error('failed to generate thumbnail blob'));
						}
					},
					type,
					quality
				);
			});

			const url = URL.createObjectURL(blob);

			mediaPreviewLogger('generated frame thumbnail', {
				size: blob.size,
				url,
				width: targetWidth,
				height: targetHeight
			});

			return {
				blob,
				url,

				width: targetWidth,
				height: targetHeight,

				timestamp: clampedTimestamp
			};
		} catch (error) {
			mediaPreviewLogger.error(error);
			throw error;
		}
	}

	dispose() {
		mediaPreviewLogger('disposing thumbnail generator');

		if (this.currentUrl) {
			URL.revokeObjectURL(this.currentUrl);
		}

		this.video.pause();
		this.video.removeAttribute('src');
		this.video.load();

		this.currentFile = undefined;
		this.currentUrl = undefined;
	}
}

export const frameRenderer = new FrameRenderer();

async function pipeStream(
	input: ReadableStream<Uint8Array>,
	push: (chunk: Uint8Array, final?: boolean) => Promise<void>
) {
	const reader = input.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) await push(value);
		}
	} finally {
		reader.releaseLock();
	}
}

export async function exportBundle(writer: ByteWriter, name: string) {
	const assets = Object.values(media.assets);
	mediaProjectExportLogger('exporting', assets.length, 'assets');

	const manifest = {
		version: 1,
		name,
		assets: assets.map((a) => ({
			id: a.id,
			name: a.name,
			type: a.type,
			size: a.size,
			width: a.width,
			height: a.height,
			duration: a.duration
		}))
	};

	const writableStream = new WritableStream<Uint8Array>({
		write: (chunk) => writer.write(chunk),
		close: () => writer.close()
	});

	const zipWriter = new ZipWriter(writableStream, { zip64: true });

	const manifestBlob = new Blob([JSON.stringify(manifest)]);
	await zipWriter.add('project.json', new BlobReader(manifestBlob), { level: 6 });

	for (const asset of assets) {
		const file = await getAssetFile(asset);
		mediaProjectExportLogger('exporting asset', asset.name, formatBytes(file.size));

		await zipWriter.add(`assets/${asset.id}`, new BlobReader(file), { level: 0 });

		mediaProjectExportLogger('finished asset', asset.name);
	}

	await zipWriter.close();
	mediaProjectExportLogger('bundle export complete');
}

function yeild() {
	return new Promise((r) => setTimeout(r, 0));
}

function every(number: number) {
	let counter = 0;
	return () => {
		if (counter > number) {
			counter = 0;
			return true;
		}
		counter++;
		return false;
	};
}
