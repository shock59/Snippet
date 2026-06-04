import {
	Output,
	WebMOutputFormat,
	MkvOutputFormat,
	Mp4OutputFormat,
	MovOutputFormat,
	VIDEO_CODECS,
	AUDIO_CODECS,
	canEncodeVideo,
	canEncodeAudio,
	type VideoCodec,
	type AudioCodec,
	type MediaCodec
} from 'mediabunny';

type ContainerKey = 'webm' | 'mkv' | 'mp4' | 'mov';

const containers = {
	webm: () => new WebMOutputFormat(),
	mkv: () => new MkvOutputFormat(),
	mp4: () => new Mp4OutputFormat(),
	mov: () => new MovOutputFormat()
} satisfies Record<ContainerKey, () => Output['format']>;

type Selection = {
	container?: ContainerKey;
	video?: VideoCodec;
	audio?: AudioCodec;
};

type ProbeSource = 'webcodecs' | 'mediabunny';
type ProbeResult = {
	ok: boolean;
	source: ProbeSource;
	codecString?: string;
	note?: string;
};

type ComboRecord = {
	container: ContainerKey;
	video: VideoCodec;
	audio: AudioCodec;
	containerSupportsVideo: boolean;
	containerSupportsAudio: boolean;
	browserVideoOk: boolean;
	browserAudioOk: boolean;
	ok: boolean;
	reasons: Array<'container-video' | 'container-audio' | 'browser-video' | 'browser-audio'>;
};

type SupportedFormats = {
	combos: Record<string, ComboRecord>;
};

function keyOf(container: ContainerKey, video: VideoCodec, audio: AudioCodec) {
	return `${container}|${video}|${audio}`;
}

function videoCodecString(codec: VideoCodec): string | null {
	switch (codec) {
		case 'avc':
			return 'avc1.42E01E';
		case 'hevc':
			return 'hvc1.1.6.L93.B0';
		case 'vp9':
			return 'vp09.00.10.08';
		case 'av1':
			return 'av01.0.08M.08';
		case 'vp8':
			return 'vp8';
	}
}

function audioCodecString(codec: AudioCodec): string | null {
	switch (codec) {
		case 'aac':
			return 'mp4a.40.2';
		case 'opus':
			return 'opus';
		case 'mp3':
			return 'mp3';
		case 'vorbis':
			return 'vorbis';
		case 'flac':
			return 'flac';
		case 'ac3':
			return 'ac-3';
		case 'eac3':
			return 'ec-3';
		default:
			return null;
	}
}

async function probeVideoBrowser(codec: VideoCodec): Promise<ProbeResult> {
	const mapped = videoCodecString(codec);

	if (
		mapped &&
		typeof VideoEncoder !== 'undefined' &&
		typeof VideoEncoder.isConfigSupported === 'function'
	) {
		try {
			const result = await VideoEncoder.isConfigSupported({
				codec: mapped,
				width: 16,
				height: 16,
				bitrate: 500_000,
				framerate: 30
			});
			return {
				ok: result.supported ?? false,
				source: 'webcodecs',
				codecString: mapped
			};
		} catch {}
	}

	return {
		ok: await canEncodeVideo(codec),
		source: 'mediabunny',
		note: mapped ? 'webcodecs failed' : 'no direct WebCodecs codec-string mapping'
	};
}

async function probeAudioBrowser(codec: AudioCodec): Promise<ProbeResult> {
	const mapped = audioCodecString(codec);

	if (
		mapped &&
		typeof AudioEncoder !== 'undefined' &&
		typeof AudioEncoder.isConfigSupported === 'function'
	) {
		try {
			const result = await AudioEncoder.isConfigSupported({
				codec: mapped,
				sampleRate: 48_000,
				numberOfChannels: 2,
				bitrate: 128_000
			});
			return {
				ok: result.supported ?? false,
				source: 'webcodecs',
				codecString: mapped
			};
		} catch {}
	}

	return {
		ok: await canEncodeAudio(codec),
		source: 'mediabunny',
		note: mapped ? 'webcodecs failed' : 'no direct WebCodecs codec-string mapping'
	};
}

export async function getSupported(): Promise<SupportedFormats> {
	const containerFormats: Record<ContainerKey, Output['format']> = {
		webm: containers.webm(),
		mkv: containers.mkv(),
		mp4: containers.mp4(),
		mov: containers.mov()
	};

	const containerCodecSets: Record<ContainerKey, Set<MediaCodec>> = {
		webm: new Set(containerFormats.webm.getSupportedCodecs()),
		mkv: new Set(containerFormats.mkv.getSupportedCodecs()),
		mp4: new Set(containerFormats.mp4.getSupportedCodecs()),
		mov: new Set(containerFormats.mov.getSupportedCodecs())
	};

	const [videoBrowser, audioBrowser] = await Promise.all([
		Promise.all(
			VIDEO_CODECS.map(async (codec) => [codec, await probeVideoBrowser(codec)] as const)
		),
		Promise.all(AUDIO_CODECS.map(async (codec) => [codec, await probeAudioBrowser(codec)] as const))
	]);

	const videoBrowserMap = Object.fromEntries(videoBrowser);
	const audioBrowserMap = Object.fromEntries(audioBrowser);

	const combos: Record<string, ComboRecord> = {};

	for (const container of Object.keys(containerFormats) as ContainerKey[]) {
		for (const video of VIDEO_CODECS) {
			for (const audio of AUDIO_CODECS) {
				const containerSupportsVideo = containerCodecSets[container].has(video);
				const containerSupportsAudio = containerCodecSets[container].has(audio);

				const browserVideoOk = videoBrowserMap[video].ok;
				const browserAudioOk = audioBrowserMap[audio].ok;

				const reasons: ComboRecord['reasons'] = [];
				if (!containerSupportsVideo) reasons.push('container-video');
				if (!containerSupportsAudio) reasons.push('container-audio');
				if (!browserVideoOk) reasons.push('browser-video');
				if (!browserAudioOk) reasons.push('browser-audio');

				combos[keyOf(container, video, audio)] = {
					container,
					video,
					audio,
					containerSupportsVideo,
					containerSupportsAudio,
					browserVideoOk,
					browserAudioOk,
					ok: reasons.length === 0,
					reasons
				};
			}
		}
	}

	return { combos };
}

export function getAllowedValues(datastore: SupportedFormats, selection: Selection) {
	const allowedContainers = new Set<ContainerKey>();
	const allowedVideos = new Set<VideoCodec>();
	const allowedAudios = new Set<AudioCodec>();

	for (const record of Object.values(datastore.combos)) {
		if (selection.container && record.container !== selection.container) continue;
		if (selection.video && record.video !== selection.video) continue;
		if (selection.audio && record.audio !== selection.audio) continue;
		if (!record.ok) continue;

		allowedContainers.add(record.container);
		allowedVideos.add(record.video);
		allowedAudios.add(record.audio);
	}

	return {
		containers: allowedContainers,
		videos: allowedVideos,
		audios: allowedAudios
	};
}
