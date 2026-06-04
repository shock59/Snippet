import { media } from '$lib/media/assets';
import { clipType, type TimelineClip } from '$lib/media/types';

export type ClipTransform = {
	x: number;
	y: number;
	width?: number;
	height?: number;
	rotation: number;
	opacity: number;
	anchorX: number;
	anchorY: number;
};

export type VisibleClip = {
	clip: TimelineClip;
	url: string | null;
	localTime: number;
	mediaTime: number;
	transform: ClipTransform;
};

export const defaultTransform: ClipTransform = {
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
	anchorX: 0.5,
	anchorY: 0.5
};

export function getVisibleClips(clips: TimelineClip[], currentTimestamp: number): VisibleClip[] {
	const assets = media.assets;
	const result: VisibleClip[] = [];

	for (const clip of clips) {
		if (clip.hidden) continue;
		if (currentTimestamp < clip.start) continue;
		if (currentTimestamp >= clip.start + clip.duration) continue;

		const localTime = currentTimestamp - clip.start;

		let url: string | null = null;
		let mediaTime = localTime;

		switch (clip.type) {
			case clipType.image:
			case clipType.audio: {
				const asset = assets[clip.assetId];
				url = asset?.objectUrl ?? null;
				break;
			}

			case clipType.video: {
				const asset = assets[clip.assetId];
				url = asset?.objectUrl ?? null;
				const rate = clip.playbackRate ?? 1;
				const trim = clip.startTrim ?? 0;
				mediaTime = localTime * rate + trim;
				break;
			}
		}

		result.push({
			clip,
			url,
			localTime,
			mediaTime,
			transform: clip.transform ? { ...defaultTransform, ...clip.transform } : defaultTransform
		});
	}

	return result;
}
