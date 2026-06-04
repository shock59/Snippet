import type { ClipTransform } from '../../routes/editor/visibleClips';

export interface MediaAsset {
	id: string;

	path: string;

	objectUrl: string;

	name: string;
	type: string;
	size: number;

	duration?: number;

	width?: number;
	height?: number;

	previewUrl?: string;

	waveform?: Float32Array;
}

type flat<t> = { [k in keyof t]: t[k] } & {};

type EnumFromArgs<T extends string[]> = {
	[K in keyof T as T[K] extends string ? T[K] : never]: K extends `${infer N extends number}`
		? N
		: never;
};

function Enum<T extends string[]>(...args: T): flat<EnumFromArgs<T>> {
	return Object.fromEntries(args.map((arg, i) => [arg, i])) as flat<EnumFromArgs<T>>;
}

export const clipType = Enum('video', 'text', 'audio', 'image', 'solid');
export type ClipType = typeof clipType;

type Values<T> = T[keyof T];
export interface BaseClip {
	id: string;

	type: Values<ClipType>;

	start: number;
	duration: number;

	track: string;

	name?: string;
	color?: string;

	locked?: boolean;
	hidden?: boolean;

	muted?: boolean;

	selected?: boolean;

	transform?: ClipTransform;

	asset?: MediaAsset; // stupid
}

export interface VideoClip extends BaseClip {
	type: ClipType['video'];
	playbackRate?: number;
	startTrim?: number;
	reverse?: boolean;

	volume?: number;

	assetId: string;
	asset: MediaAsset;
}

export interface TextClip extends BaseClip {
	type: ClipType['text'];

	text: string;

	fontFamily?: string;
	fontSize?: number;

	fontWeight?: number;

	align?: 'left' | 'center' | 'right';

	color?: string;

	strokeColor?: string;
	strokeWidth?: number;
}

export interface AudioClip extends BaseClip {
	type: ClipType['audio'];
	gain?: number;

	pan?: number;

	reverse?: boolean;
	volume?: number;
	asset: MediaAsset;
	playbackRate?: number;

	startTrim?: number;

	assetId: string;
}

export interface ImageClip extends BaseClip {
	type: ClipType['image'];
	objectFit?: 'contain' | 'cover' | 'stretch';

	assetId: string;
	asset: MediaAsset;
	duration: number;
}

export interface TextClip extends BaseClip {
	type: ClipType['text'];

	text: string;

	//todo shit like align and font and size and weight
}

export interface SolidClip extends BaseClip {
	type: ClipType['solid'];

	color: string;
}

export type TimelineClip = VideoClip | AudioClip | ImageClip | TextClip | SolidClip;

export interface Thumbnail {
	timestamp: number;

	url: string;

	width: number;
	height: number;
}
