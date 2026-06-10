<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import { formatBytes, measureText, onAnimationFrame } from '$lib/utils';
	import { onDestroy, onMount } from 'svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import {
		Play,
		Pause,
		Square,
		Plus,
		SkipBack,
		Settings,
		Save,
		Download,
		Clapperboard,
		MousePointer2,
		TextCursor,
		Folders
	} from '@lucide/svelte';
	import SnippetIconAnimated from '$lib/components/SnippetIconAnimated.svelte';
	import promptFor from '$lib/popups';
	import { writable } from 'svelte/store';
	import {
		mouseX,
		mouseXMomentum,
		mouseY,
		mouseYMomentum,
		onMouseUp,
		registerState,
		setCursor
	} from '$lib/globals';
	import { createLogger } from '$lib/debug';
	import { crossfade } from 'svelte/transition';
	import { clipType, type MediaAsset, type TimelineClip } from '$lib/media/types';
	import { media, mimeToClipType } from '$lib/media/assets';
	import { projects } from '$lib/media/manager';
	import { activeChord, chordHints, registerKeybind } from '$lib/kbd';
	import { type KeybindStep } from '$lib/kbd.svelte';
	import SnippetIcon from '$lib/components/SnippetIcon.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import Clip from './Clip.svelte';
	import { getVisibleClips } from './visibleClips';
	import PreviewElement from './PreviewElement.svelte';
	import { scalenum } from '$lib';
	import { Input } from '$lib/components/ui/input';
	import ButtonGroup from '$lib/components/ui/button-group/';
	import Flex from '$lib/components/Flex.svelte';

	let lastChordHints: typeof $chordHints = $state([]);

	const destroyFns: (() => any)[] = [];

	destroyFns.push(
		chordHints.subscribe((v) => {
			if (v.length) lastChordHints = v;
		})
	);

	const [send, receive] = crossfade({
		duration: (d) => Math.max(Math.sqrt(d * 300))
		// fallback: (node, c) =>
		// fade(node, {
		// 	delay: c.delay,
		// 	duration: typeof c.duration === 'number' ? c.duration : c.duration?.(0)
		// })
	});

	const editorLogger = createLogger('editor', {
		shapeRight: 'angled'
	});

	const JAMIEPAIGE = createLogger('jamie', {
		shapeRight: 'angled',
		shapeLeft: 'angled',
		color: '#e1513b'
	});

	const playheadLogger = editorLogger.child('playhead', {
		color: '#ffaaaa'
	});

	const tickLogger = editorLogger.child('ticks', {
		color: '#262626'
	});

	const clipLogger = editorLogger.child('clips', {
		color: '#37515F'
	});

	editorLogger('starting');

	// svelte-ignore non_reactive_update
	let timelineXScroll: HTMLDivElement;
	let timelineYScroll: HTMLDivElement;
	let timelineDiv: HTMLDivElement;
	let tracksDiv: HTMLDivElement;
	let previewDiv: HTMLDivElement;

	let previewDimensions: Dimensions = $state({
		width: 0,
		height: 0
	});

	let length = $state(66.1661);

	let fps = $state(60);

	/**
	 * zoom= px per second
	 */
	let zoom = $state(500);
	let zoomTarget: number = 0;
	let setZoomCallback: (() => void) | null = null;
	let zoomChangeRequested = false;

	let minZoom = 0.5;
	let maxZoom = 2000;

	function setZoom(newTarget: number, cb?: () => void) {
		zoomTarget = Math.max(minZoom, Math.min(maxZoom, newTarget));
		setZoomCallback = cb ?? null;

		zoomChangeRequested = true;
	}

	let currentTimestamp = $state(0);
	let speed = 1;
	let playing = $state(false);

	function play() {
		playing = true;
		playheadLogger('playing');
	}

	function stop() {
		playing = false;
		playheadLogger('stopping');
	}

	type Tick = {
		stamp: number;
		showStamp?: boolean;
		stampOnLeft?: boolean;
		state: 'major' | 'intermediate' | 'minor' | 'hidden';
	};

	let ticks: Tick[] = $state([]);
	const tickMap = new Map<number, Tick>();
	let tickState = $state({
		startIndex: 0,
		endIndex: 0,
		hiddenScale: 0,
		majorScale: 0,
		minorScale: 0
	});

	let fileInput: HTMLInputElement;
	let importInput: HTMLInputElement;

	let timelineLeftPad = $state(0);

	let playheadLeft = $state(0);
	let playheadDragged = $state(false);
	let playheadTarget = $state<number | null>(null);
	('	');
	/**
	 * 0: visible
	 * 1: overflow right
	 * -1: overflow left
	 */
	let playheadOffscreenOffset = $state(0);
	let playheadOffscreenDirection = $state(0);

	let followStrength = 0;
	let targetScrollLeft = 0;

	const FollowDelay = 400;
	const FollowSmoothing = 14;
	const PlayheadScreenOffset = 0.65;

	// const baseSteps = [0.25, 0.5, 1, 5, 10, 15, 30, 60, 120];
	const baseSteps = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32, 64, 128];

	function chooseMinorScale(pxPerSecond: number) {
		const targetMinorPx = 20;

		let lastStep = baseSteps[0];

		for (const step of baseSteps) {
			if (step * pxPerSecond >= targetMinorPx) {
				return { step, lastStep };
			}
			lastStep = step;
		}

		return { step: baseSteps[baseSteps.length - 2], lastStep: baseSteps[baseSteps.length - 1] };
	}

	function chooseMajorDivision(minorPx: number) {
		const candidates = [1, 2, 4, 6, 8, 12, 16];
		// const candidates = [1, 2, 4];

		let best = candidates[0];
		let bestDiff = Infinity;

		for (const div of candidates) {
			const px = minorPx * div;
			const diff = Math.abs(px - 80);

			if (diff < bestDiff) {
				best = div;
				bestDiff = diff;
			}
		}

		return best;
	}
	function curveZoomDelta(deltaY: number) {
		const sensitivity = 0.002;

		const zoomFactor = deltaY * zoom * sensitivity;

		return Math.sign(deltaY) * Math.pow(Math.abs(zoomFactor), 0.95);
	}

	let userScrolling = $state(false);
	let lastUserScrollTime = 0;

	const leftHist: number[] = [];

	const MaxLeftHist = 256;
	const stableSteps = [MaxLeftHist, 128, 64, 32, 16];

	let frameNumber = $state(0);

	function calcPlayheadLeft() {
		const timelineRect = timelineDiv.getBoundingClientRect();

		const width = timelineXScroll.clientWidth;

		const rawPlayheadLeft = currentTimestamp * zoom - getScrollLeft();
		leftHist.push(rawPlayheadLeft);
		while (leftHist.length > MaxLeftHist) leftHist.shift();

		let s: undefined | ReturnType<typeof stable> = undefined;

		for (const step of stableSteps) {
			s = stable(leftHist.slice(-step, -1));
			if (s) {
				break;
			}
		}

		if (!s) {
			playheadLeft = rawPlayheadLeft;
		} else {
			const avrgBias = Math.max(0, Math.min(1, (s.variance - 2.5) / 20));
			playheadLeft = avrgBias * rawPlayheadLeft + (1 - avrgBias) * s.average;
		}
		playheadLeft += getScrollLeft();

		if (playheadLeft + timelineRect.x < -10) {
			const offset = Math.max(-16, playheadLeft + timelineRect.x + 15);
			playheadOffscreenOffset = -offset;
			playheadOffscreenDirection = 1;
		} else if (playheadLeft + timelineRect.x > width + 10) {
			const offset = Math.min(16, playheadLeft + timelineRect.x - (width + 15));
			playheadOffscreenOffset = offset;
			playheadOffscreenDirection = -1;
		} else {
			playheadOffscreenOffset = 0;
			playheadOffscreenDirection = 0;
		}
	}

	function variance(array: number[]) {
		const max = Math.max(...array);
		const min = Math.min(...array);
		return max - min;
	}

	function stable(array: number[]) {
		const v = variance(array);
		if (v > 2.5) return undefined;
		return { average: averageArray(array), variance: v };
	}

	function clamp(min: number, max: number, number: number) {
		return Math.min(max, Math.max(min, number));
	}

	function movePlayheadTo(timestamp: number) {
		playheadTarget = clamp(0, length, timestamp);
	}

	function averageArray(array: number[]): number {
		return array.reduce((p, v) => p + v, 0) / array.length;
	}

	function updateTicks(leftSeconds: number, rightSeconds: number) {
		const { step: minorScale, lastStep: hiddenScale } = chooseMinorScale(zoom);
		const majorDivision = chooseMajorDivision(minorScale * zoom);
		const majorScale = minorScale * majorDivision;
		let startIndex = Math.floor(leftSeconds / hiddenScale) - 1;
		let endIndex = Math.ceil(rightSeconds / hiddenScale) + 1;

		const needsRecalc =
			startIndex < tickState.startIndex ||
			endIndex > tickState.endIndex ||
			hiddenScale !== tickState.hiddenScale ||
			majorScale !== tickState.majorScale ||
			minorScale !== tickState.minorScale;

		if (!needsRecalc) return;
		tickLogger('recalculating ticks');

		startIndex -= 15;
		endIndex += 15;

		tickState = {
			startIndex,
			endIndex,
			hiddenScale,
			majorScale,
			minorScale
		};

		const visible = new Set<number>();

		for (let i = startIndex; i <= endIndex; i++) {
			const stamp = Number((i * hiddenScale).toFixed(6));
			if (stamp > length) continue;
			if (stamp < 0) continue;
			visible.add(stamp);

			const major =
				Math.round(stamp / majorScale) * majorScale === stamp && Math.round(stamp) === stamp;
			const intermediate =
				!major && Math.round(stamp / (minorScale * 4)) === stamp / (minorScale * 4);
			const minor = Math.round(stamp / minorScale) * minorScale === stamp;

			let tick = tickMap.get(stamp);
			if (!tick) {
				tick = {
					stamp,
					state: major ? 'major' : intermediate ? 'intermediate' : minor ? 'minor' : 'hidden',
					showStamp: intermediate || major
				};
				tickMap.set(stamp, tick);
			} else {
				tick.state = major ? 'major' : intermediate ? 'intermediate' : minor ? 'minor' : 'hidden';
				tick.showStamp = intermediate || major;
			}
			if (stamp === length) {
				tick.stampOnLeft = true;
			}
		}

		for (const [stamp] of tickMap) {
			if (!visible.has(stamp)) {
				tickMap.delete(stamp);
			}
		}

		ticks = Array.from(tickMap.values()).sort((a, b) => a.stamp - b.stamp);
	}

	function updateUserScrollState() {
		const now = performance.now();
		if (now - lastUserScrollTime > 150) {
			userScrolling = false;
		}
	}

	function handlePlayheadDrag(width: number, dtSeconds: number) {
		const rect = timelineYScroll.getBoundingClientRect();

		const edgeSize = 120;
		const maxSpeed = 1600;
		const localMouseX = $mouseX - rect.left;
		let velocity = 0;

		if (localMouseX > width - edgeSize) {
			const t = (localMouseX - (width - edgeSize)) / edgeSize;
			velocity = t * maxSpeed;
		} else if (localMouseX < edgeSize) {
			const t = (edgeSize - localMouseX) / edgeSize;
			velocity = -t * maxSpeed;
		}

		setScrollLeft(getScrollLeft() + velocity * dtSeconds);
		currentTimestamp = getTimestampAtMouse();
	}

	function getTimestampAtMouse() {
		return getTimestampAtScreenX($mouseX);
	}

	function getTimestampAtScreenX(x: number, updator?: any) {
		const rect = timelineDiv.getBoundingClientRect();
		const localX = x - rect.left;
		return clamp(0, length, localX / zoom);
	}

	function getScrollTop(updator?: any) {
		return timelineXScroll?.scrollTop || timelineYScroll?.scrollTop;
	}
	function getScrollLeft(updator?: any) {
		return timelineXScroll?.scrollLeft || timelineYScroll?.scrollLeft;
	}

	function getContainerWidth(updator?: any) {
		return timelineXScroll?.clientWidth || timelineYScroll?.clientWidth;
	}

	function getTimelineWidth(updator?: any) {
		return timelineDiv?.clientWidth;
	}

	function setScrollLeft(v: number, smooth = false) {
		if (!smooth) {
			timelineXScroll.scrollLeft = v;
			timelineYScroll.scrollLeft = v;
		} else {
			timelineXScroll.scrollTo({ left: v, behavior: 'smooth' });
			timelineYScroll.scrollTo({ left: v, behavior: 'smooth' });
		}
	}

	function getTrackAtMouse() {
		const rect = tracksDiv.getBoundingClientRect();

		const localMouseY = $mouseY - rect.top;
		let remaining = localMouseY;
		if (remaining < 0) return null;
		let stackedHeight = 0;

		for (const track of tracks) {
			remaining -= track.height;
			if (remaining <= 0) {
				return { track, y: stackedHeight, screenY: stackedHeight + rect.top };
			}
			stackedHeight += track.height;
		}

		// editorLogger({ ...rect.toJSON() }, top, localMouseY);

		return null;
	}

	function getTrackScreenInfo(trackId: string) {
		const rect = tracksDiv.getBoundingClientRect();

		let stackedHeight = 0;

		for (const track of tracks) {
			if (track.id == trackId) {
				return { track, y: stackedHeight, screenY: stackedHeight + rect.top };
			}
			stackedHeight += track.height;
		}

		// editorLogger({ ...rect.toJSON() }, top, localMouseY);

		return null;
	}

	function updateFollowState(width: number, dtSeconds: number) {
		const maxScrollLeft = timelineXScroll.scrollWidth - width;
		const playheadWorldX = currentTimestamp * zoom;
		const desiredScreenX = width * PlayheadScreenOffset;
		const desiredScrollLeft = playheadWorldX - desiredScreenX;
		const now = performance.now();
		const shouldFollow = playing && !playheadDragged && now - lastUserScrollTime > FollowDelay;

		followStrength = smoothDamp(followStrength, shouldFollow ? 1 : 0, dtSeconds, 10);
		targetScrollLeft = smoothDamp(targetScrollLeft, desiredScrollLeft, dtSeconds, FollowSmoothing);
		targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetScrollLeft));

		if (followStrength > 0.001) {
			const current = getScrollLeft();
			setScrollLeft(smoothDamp(current, targetScrollLeft, dtSeconds, 20 * followStrength));
		}
	}

	function smoothDamp(current: number, target: number, dt: number, speed: number) {
		return current + (target - current) * (1 - Math.exp(-speed * dt));
	}

	const subMap = {
		[1 / 4]: '1/4',
		[1 / 2]: '1/2',
		[3 / 4]: '3/4',
		[1 / 8]: '1/8',
		[3 / 8]: '3/8',
		[5 / 8]: '5/8',
		[7 / 8]: '7/8'
	};

	function formatTimelineTimestamp(seconds: number) {
		if (Math.round(seconds) !== seconds) {
			const sub = seconds - Math.floor(seconds);
			return subMap[sub].toString();
		}

		// why the fuck this wouldprobably nuke your computer lmao
		const days = Math.floor(seconds / 60 / 60 / 24) % 60;

		const hours = Math.floor(seconds / 60 / 60) % 24;
		const mins = Math.floor(seconds / 60) % 60;
		const secs = Math.round((seconds % 60) * 4) / 4;

		return `${days ? `${days}d ` : ''} ${hours ? `${hours.toString().padStart(2, '0')}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	function formatTimestamp(seconds: number) {
		const lenDays = Math.floor(length / 86400);
		const lenHours = Math.floor(length / 3600) % 24;

		const days = Math.floor(seconds / 86400);
		const hours = Math.floor(seconds / 3600) % 24;
		const mins = Math.floor(seconds / 60) % 60;
		const secs = Math.floor(seconds % 60);

		const ms = Math.floor((seconds % 1) * 100)
			.toString()
			.padStart(2, '0');

		let result = '';

		if (lenDays > 0) {
			result += `${days}d `;
		}

		if (lenHours > 0 || lenDays > 0) {
			result += `${hours.toString().padStart(2, '0')}:`;
		}

		result += `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;

		return result;
	}

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey) {
			e.preventDefault();

			// const oldZoom = zoom;
			// const direction = e.deltaY > 0 ? -0.5 : 0.5;
			// const zoomFactor = 1.1 ** direction;
			// const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom * zoomFactor));

			// const rect = timelineXScroll.getBoundingClientRect();
			// const lmouseX = $mouseX - rect.left;
			// const cursorTimestamp = (getScrollLeft() + lmouseX) / oldZoom;

			// zoom = newZoom;
			// const newScrollLeft = cursorTimestamp * newZoom - lmouseX;
			// setScrollLeft(newScrollLeft);
			// targetScrollLeft = getScrollLeft();
			const rect = timelineDiv.getBoundingClientRect();

			const offset = rect.x + getScrollLeft();
			timelineLeftPad = offset;

			const oldZoom = zoom;
			let targetZoom = zoom;
			targetZoom = targetZoom + curveZoomDelta(-e.deltaY);
			setZoom(targetZoom, () => {
				const target = $mouseX - offset;
				const cursorTimestamp = (getScrollLeft() + target) / oldZoom;
				const newScrollLeft = cursorTimestamp * zoom - target;
				setScrollLeft(newScrollLeft);
				targetScrollLeft = newScrollLeft;
			});
		} else {
			lastUserScrollTime = performance.now();
			userScrolling = true;
		}
	}

	destroyFns.push(onAnimationFrame(runFrame));

	type Track = {
		id: string;
		height: number;
	};

	const tracks: Track[] = $state([]);

	const clips: TimelineClip[] = $state([]);

	const canvasDimensions: Dimensions = $state({
		width: 1920,
		height: 1080
	});
	5;
	let loading = $state(true);

	// svelte-ignore state_referenced_locally
	let visibleClips = $state(getVisibleClips(clips, currentTimestamp));

	function runFrame(dt?: number) {
		if (!timelineXScroll) return;
		if (zoomChangeRequested) {
			zoom = zoomTarget;
			setZoomCallback?.();
			calcPlayheadLeft();
			zoomChangeRequested = false;
		}
		frameNumber += 1;

		const scrollLeft = getScrollLeft();
		const width = timelineXScroll.clientWidth;
		const rect = timelineXScroll.getBoundingClientRect();
		const contentWidth = timelineXScroll.firstElementChild?.clientWidth ?? width;
		const leftSeconds = Math.max(0, scrollLeft / zoom);
		const rightSeconds = Math.min((scrollLeft + width) / zoom, contentWidth / zoom);

		if (rightSeconds <= leftSeconds) return;

		const dtSeconds = dt ? dt / 1000 : 1 / 60;
		updateFollowState(width, dtSeconds);

		updateTicks(leftSeconds, rightSeconds);
		updateUserScrollState();

		if (playheadTarget != null) {
			if (playing || playheadDragged) {
				playheadTarget = null;
			} else {
				const remaining = playheadTarget - currentTimestamp;
				const snapThreshold = 1 / 240;
				if (
					Math.abs(remaining) <= snapThreshold ||
					(remaining > 0 && currentTimestamp > playheadTarget) ||
					(remaining < 0 && currentTimestamp < playheadTarget)
				) {
					currentTimestamp = playheadTarget;
					playheadTarget = null;
				} else {
					const speed = 24;
					const t = 1 - Math.exp(-speed * dtSeconds);
					currentTimestamp += remaining * t;
					currentTimestamp = clamp(0, length, currentTimestamp);
				}
			}
		}

		if (playheadDragged) {
			handlePlayheadDrag(width, dtSeconds);
		}

		if (playing && dt) {
			currentTimestamp += (dt / 1000) * speed;
			if (currentTimestamp > length) {
				currentTimestamp = length;
				stop();
			}
		}
		calcPlayheadLeft();

		previewDimensions.width = previewDiv.clientWidth;
		previewDimensions.height = previewDiv.clientHeight;

		visibleClips = getVisibleClips(clips, currentTimestamp);
	}

	let highlightedClip = $state('');

	const indexCache = new Map<string, number>();

	function setClipById(id: string, clipData: Partial<Omit<TimelineClip, 'id'>>) {
		let index = indexCache.get(id);

		if (index !== undefined && clips[index]?.id === id) {
			Object.assign(clips[index], clipData);
			return;
		}
		index = clips.findIndex((c) => c.id === id);

		if (index !== -1) {
			indexCache.set(id, index);
			Object.assign(clips[index], clipData);
		}
	}

	function deleteClipById(id: string) {
		let index = indexCache.get(id);

		if (index === undefined || clips[index]?.id !== id) {
			index = clips.findIndex((c) => c.id === id);
		}

		if (index !== -1) {
			clips.splice(index, 1);
			indexCache.delete(id);
		}
	}

	let draggedClip: {
		data: TimelineClip;
		x: number;
		y: number;
		height: number;
		width: number;
		rotation: number;
		floating: boolean;
		opacity?: number;

		rotateCenterX: number;
		rotateCenterY: number;
	} = $state({} as any /* :3 */);

	// svelte made me do this
	let draggedClipId: string | null = $state(null);

	const pseudoClips: Record<string, typeof draggedClip> = $state({});

	function throwClipAcrossScreenReallyCoolAmazing(clip: typeof draggedClip) {
		const entryId = id();

		pseudoClips[entryId] = clip;

		const mx = $mouseXMomentum * 1000;
		const my = $mouseYMomentum * 1000;

		const duration = 10750;
		let t = 0;
		let rt = 0;
		const startX = clip.x;
		const startY = clip.y;

		const startRotation = clip.rotation ?? 0;

		const startOffsetWidthPercent = clip.rotateCenterX / clip.width;
		const grabOffsetFromCenter = startOffsetWidthPercent - 0.5;

		const rotationVelocity = (Math.random() * 2 + 1) * 40 * (grabOffsetFromCenter * (my / 200));

		const horizontalVelocity = mx + (Math.random() * 80 - 40);

		const initialVerticalVelocity = my;

		const gravity = 2000;

		const theta = (startRotation * Math.PI) / 180;

		const dx = clip.width / 2 - clip.rotateCenterX;
		const dy = clip.height / 2 - clip.rotateCenterY;

		clip.x += dx * (Math.cos(theta) - 1) - dy * Math.sin(theta);
		clip.y -= dx * Math.sin(theta) + dy * (Math.cos(theta) - 1);

		clip.rotateCenterX = clip.width / 2;
		clip.rotateCenterY = clip.height / 2;

		let last = 0;

		const stop = onAnimationFrame((dt) => {
			rt += dt;
			if (rt - 0 > last) {
				last = rt;
			} else return;
			t += dt;

			const seconds = t / 1000;
			const progress = Math.min(1, t / duration);

			const eased = 1 - Math.pow(1 - progress, 3);

			const x = startX + horizontalVelocity * seconds;
			// const x = 500,
			// 	y = 500,
			// 	rotation = 90 * 8;
			const y = startY + initialVerticalVelocity * seconds + 0.5 * gravity * seconds * seconds;
			const rotation = startRotation + rotationVelocity * seconds;
			const opacity = (1 - eased) * 20;

			if (!pseudoClips[entryId]) {
				stop();
				return;
			}
			pseudoClips[entryId] = {
				...clip,
				x,
				y,
				rotation,
				opacity
			};

			if (progress >= 1) {
				delete pseudoClips[entryId];
				stop();
			}
		});
	}

	const s = writable<Record<string, any>>();

	const frameTimeHist: number[] = [];
	let appFps = $state(0);

	destroyFns.push(
		onAnimationFrame((dt) => {
			const now = performance.now();

			frameTimeHist.push(now);

			while (frameTimeHist.length > 0 && frameTimeHist[0]! < now - 1000) {
				frameTimeHist.shift();
			}

			appFps = frameTimeHist.length;
		})
	);

	$effect(() => {
		s.set({
			fps: appFps,
			loading,
			tickCount: ticks.length,
			tickState,
			ticks,
			playhead: {
				left: playheadLeft,
				dragged: playheadDragged,
				offscreen: playheadOffscreenOffset,
				offscreenDirection: playheadOffscreenDirection,
				currentTimestamp
			},
			zoom,
			userScrolling,
			mouse: {
				x: $mouseX,
				y: $mouseY,
				$mouseXMomentum,
				$mouseYMomentum
			},
			clipState: {
				draggedClip
			},
			highlightedClip,
			canvasDimensions,
			previewDimensions,
			activeClips: visibleClips,
			tracks,
			clips,
			frameNumber,
			assets: $media.assets
		});
	});

	registerState(s, 'editor');

	registerKeybind({ bind: 'ctrl+s', name: 'Save current project' }, () => {
		alert('this should save');
	});

	registerKeybind({ bind: 'ctrl+e', name: 'Export' }, () => {
		alert('this should export');
	});

	registerKeybind({ bind: 'ctrl+o l', name: 'Show local project manager' }, () => {
		alert('this should open local');
	});

	registerKeybind({ bind: 'ctrl+o f', name: 'Open project from file' }, () => {
		alert('this should open file');
	});

	registerKeybind(
		{ bind: 'up up down down left right left right b a enter', name: 'KONAMI CODE!!' },
		() => {
			alert('konami lmao');
		}
	);

	let lastChord: KeybindStep[] = $state([]);

	destroyFns.push(activeChord.subscribe((v) => v?.length && (lastChord = v)));

	onDestroy(() => {
		destroyFns.forEach((f) => f());
	});

	function id() {
		return Date.now().toString(16);
	}

	const drive = 0.008;
	const restoring = 0.05;
	const damp = 0.88;
	const widthNorm = 150;
	const maxAngle = 50;

	function createClipForAsset(asset: MediaAsset): TimelineClip {
		const type = mimeToClipType(asset.type);
		if (type === null) throw new Error('no type for mime');
		switch (type) {
			case clipType.image:
				return {
					type: clipType.image,
					duration: 10,
					id: id(),
					start: 0,
					track: '',
					assetId: asset.id,
					asset
				};
			case clipType.audio:
				return {
					type: clipType.audio,
					duration: asset.duration ?? 1,
					start: 0,
					id: id(),
					track: '',
					asset,
					assetId: asset.id
				};
			case clipType.video:
				return {
					type: clipType.video,
					duration: asset.duration ?? 1,
					id: id(),
					start: 0,
					track: '',
					assetId: asset.id,
					asset
				};
		}
	}

	function getClipBounds(clip: TimelineClip, updator?: any) {
		const left = getTimestampAtScreenX(0);
		const right = getTimestampAtScreenX(getContainerWidth(updator));
		return {
			leftSeconds: left,
			rightSeconds: right
		};
	}

	let nameInputValue = $state('');
	onMount(async () => {
		loading = false;
		editorLogger('mounted');
		const rect = timelineDiv.getBoundingClientRect();
		const offset = rect.x + getScrollLeft();
		timelineLeftPad = offset;
		await projects.refresh();
		await projects.open('untitled 2');
		nameInputValue = projects.current;
	});
	let pendingRename = $state(false);

	async function executeRename() {
		try {
			if (pendingRename) return;
			pendingRename = true;
			const currentName = projects.current;
			const newName = nameInputValue.trim();

			if (currentName === newName) return;

			const result = await promptFor('confirmation', {
				title: `Are you sure you want to rename this project to "${newName}"`,
				confirmCountdown: 1500,
				confirmText: 'Rename'
			}).catch(() => ({ confirmed: false }));

			if (!result.confirmed) {
				nameInputValue = currentName;
				pendingRename = false;
				return;
			}

			await projects.rename(currentName, newName);
		} catch (error) {
			editorLogger.error(error);
			nameInputValue = projects.current;
		} finally {
			pendingRename = false;
		}
	}
</script>

{#if loading}
	<div
		class="fixed top-0 left-0 z-100 flex h-screen w-screen flex-col items-center justify-center gap-5 bg-background"
		transition:fade
	>
		<SnippetIconAnimated />
		<p class="flex flex-row gap-0" id="loading-text">
			Loading Editor

			<span>.</span>
			<span>.</span>
			<span>.</span>
		</p>
	</div>
{/if}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	id="app"
	class="absolute top-0 left-0 flex h-screen w-screen flex-col overflow-hidden select-none"
	onmousedown={() => {
		highlightedClip = '';
	}}
>
	<nav class="flex h-8 w-full flex-row items-center justify-between border-b-2 px-2">
		<div class="flex h-full flex-1 flex-row items-center gap-2">
			<div class="flex aspect-square h-full w-auto items-center justify-center">
				<SnippetIcon size="95%" />
			</div>
			<Button size="icon-sm" variant="ghost">
				<Folders />
			</Button>
			<Input
				bind:value={nameInputValue}
				disabled={pendingRename}
				onblur={executeRename}
				variant="ghost"
				class="h-5 md:text-lg"
				onkeydown={(e) => {
					if (e.key === 'Enter') executeRename();
				}}
			/>
		</div>
		<div class="flex h-full flex-1 flex-row-reverse items-center justify-start">
			<Button size="icon-sm" variant="ghost">
				<Settings />
			</Button>
			<Button
				size="sm"
				variant="ghost"
				onclick={async () => {
					const streamSaver = (await import('streamsaver')).default;
					const fileStream = streamSaver.createWriteStream(`${projects.current}.snipkit`);
					const writer = fileStream.getWriter();

					await projects.exportBundle(writer);
				}}
			>
				<Download /> Export
			</Button>
			<Button
				size="sm"
				variant="ghost"
				onclick={() => {
					promptFor(
						'renderOptions',
						{
							clips,
							options: {
								fps,
								length,
								...canvasDimensions
							}
						},
						true
					);
				}}
			>
				<Clapperboard /> Render
			</Button>
			<Button
				size="sm"
				variant="ghost"
				onclick={() => {
					projects.save();
				}}
			>
				<Save /> Save
			</Button>
		</div>
	</nav>
	<Resizable.PaneGroup direction="vertical">
		<Resizable.Pane>
			<Resizable.PaneGroup direction="horizontal">
				<Resizable.Pane defaultSize={60}>
					<div class="relative flex h-full w-full items-center justify-center p-10">
						<!-- what the fuck -->
						<div
							style="aspect-ratio: {canvasDimensions.width / canvasDimensions.height};"
							class="flex h-auto max-h-full w-full items-center justify-center"
						>
							<div
								style="aspect-ratio: {canvasDimensions.width / canvasDimensions.height};"
								class="relative h-full w-auto bg-black"
								bind:this={previewDiv}
							>
								<!-- #region preview 
								  -->
								{#each visibleClips as vis (vis.clip.id)}
									<PreviewElement
										{playing}
										{vis}
										{currentTimestamp}
										updateTransform={(id, transform) => {
											setClipById(id, { transform });
										}}
										{canvasDimensions}
										{previewDimensions}
										bind:highlightedClip
									/>
								{/each}
							</div>
						</div>
					</div>
				</Resizable.Pane>
				<Resizable.Handle />
				<Resizable.Pane>
					<div class="flex h-full w-full flex-col p-2">
						<Button
							onclick={() => {
								fileInput.click();
							}}>Import Media</Button
						>

						<!-- <Button
							onclick={() => {
								importInput.click();
							}}>Import Project</Button
						>
						<Button
							onclick={() => {
								useKibi.update((v) => !v);
							}}>toggle kibi</Button
						>
						<Button
							onclick={async () => {
								// 							const 	bundleHandle = await showSaveFilePicker({
								// 	suggestedName: 'project.snipkit',
								// 	types: [
								// 		{
								// 			description: 'Snippet Project',
								// 			accept: {
								// 				'application/octet-stream': ['.snipkit']
								// 			}
								// 		}
								// 	]
								// });
								const streamSaver = (await import('streamsaver')).default;
								const fileStream = streamSaver.createWriteStream('test');
								const writer = fileStream.getWriter();

								await projects.exportBundle(writer);
							}}
						>
							export
						</Button>
						<Button
							onclick={async () => {
								// 							const 	bundleHandle = await showSaveFilePicker({
								// 	suggestedName: 'project.snipkit',
								// 	types: [
								// 		{
								// 			description: 'Snippet Project',
								// 			accept: {
								// 				'application/octet-stream': ['.snipkit']
								// 			}
								// 		}
								// 	]
								// });
								// const writer = await OPFS.writer('/project.snipkit.new');

								// await projects.exportBundle(writer);
								// editorLogger('done exporting');
								// await OPFS.move('/project.snipkit.new', '/project.snipkit');
								projects.save();
							}}
						>
							save
						</Button>

						<Button
							onclick={async () => {
								// 							const 	bundleHandle = await showSaveFilePicker({
								// 	suggestedName: 'project.snipkit',
								// 	types: [
								// 		{
								// 			description: 'Snippet Project',
								// 			accept: {
								// 				'application/octet-stream': ['.snipkit']
								// 			}
								// 		}
								// 	]
								// });
								// const writer = await OPFS.writer('/project.snipkit.new');

								// await projects.exportBundle(writer);
								// editorLogger('done exporting');
								// await OPFS.move('/project.snipkit.new', '/project.snipkit');
								const { value: project } = await promptFor('textInputPrompt', {
									title: 'what project wanna open bro'
								});
								if (!project) return;
								projects.open(project);
							}}
						>
							open local project
						</Button>

						<Button
							onclick={async () => {
								// 							const 	bundleHandle = await showSaveFilePicker({
								// 	suggestedName: 'project.snipkit',
								// 	types: [
								// 		{
								// 			description: 'Snippet Project',
								// 			accept: {
								// 				'application/octet-stream': ['.snipkit']
								// 			}
								// 		}
								// 	]
								// });
								const stream = await OPFS.readStream('/project.snipkit');
								const streamSaver = (await import('streamsaver')).default;
								const fileStream = streamSaver.createWriteStream('test');
								await stream.pipeTo(fileStream);
							}}
						>
							download saved
						</Button> -->
						<div
							class="mt-2 flex h-full w-full flex-col content-start items-start gap-2 overflow-y-scroll"
						>
							{#each Object.entries($media.assets) as [key, asset] (key)}
								<button
									disabled={mimeToClipType(asset.type) === null}
									class="flex h-20 w-full rounded-lg border bg-popover p-1 disabled:opacity-50"
									onmousedown={(e) => {
										const target = e.target as HTMLElement;
										if (!target) return;

										const sourceRect = target.getBoundingClientRect();
										const offsetY = e.offsetY;
										const startOffsetWidthPercent = e.offsetX / sourceRect.width;
										const grabOffsetFromCenter = startOffsetWidthPercent - 0.5;

										const clip = createClipForAsset(asset);
										clip.start = Number.MIN_SAFE_INTEGER;
										draggedClip = {
											data: clip,
											height: target.clientHeight,
											width: target.clientWidth,
											x: sourceRect.x,
											y: sourceRect.y,
											rotation: 0,
											rotateCenterX: e.offsetX,
											rotateCenterY: offsetY,
											floating: false
										};

										const resetCursor = setCursor('grabbing');

										const nameWidth = (measureText(asset.name)?.width ?? 200) + 26;

										let xEase = 0.25;
										let yEase = 0.25;
										let widthEase = 0.25;
										let heightEase = 0.25;

										let omega = 0;
										let theta = 0;
										let prevMouseX = $mouseX;
										let prevMouseY = $mouseY;

										const updateEase = (
											current: number,
											target: number,
											rampUp = 0.1,
											rampDown = 1
										) => current + (target - current) * (target < current ? rampDown : rampUp);
										const grabOffsetFromCenterY = offsetY / sourceRect.height - 0.5;

										const baseAngle =
											-grabOffsetFromCenter * 18 * (1 + grabOffsetFromCenterY * 0.2);
										const stopDragging = onAnimationFrame(() => {
											const mouseTrack = getTrackAtMouse();
											const liveSourceRect = target.getBoundingClientRect();

											const overSource =
												$mouseX >= liveSourceRect.x &&
												$mouseX <= liveSourceRect.x + liveSourceRect.width &&
												$mouseY >= liveSourceRect.y &&
												$mouseY <= liveSourceRect.y + liveSourceRect.height;

											const mode = overSource ? 'source' : mouseTrack ? 'track' : 'floating';

											const dX = $mouseX - prevMouseX;
											const dY = $mouseY - prevMouseY;
											prevMouseX = $mouseX;
											prevMouseY = $mouseY;

											const widthScale = widthNorm / Math.max(draggedClip.width, 40);

											if (mode === 'floating') {
												const torqueX = dX * drive * widthScale;
												const torqueY = dY * grabOffsetFromCenter * drive * widthScale;
												omega += torqueX + torqueY * 6;
												omega -= (theta - baseAngle) * restoring;
												omega *= damp;
											} else {
												omega *= 0.1;
												omega -= theta * 0.18;
												omega *= damp;
											}

											theta = Math.max(-maxAngle, Math.min(maxAngle, theta + omega));
											draggedClip.rotation = theta;

											const floatingHeight = 40;

											const targetX =
												mode === 'source'
													? liveSourceRect.x
													: $mouseX - draggedClip.width * startOffsetWidthPercent;

											const targetY =
												mode === 'source'
													? liveSourceRect.y
													: mode === 'track'
														? mouseTrack!.screenY + 4
														: $mouseY - offsetY * (40 / liveSourceRect.height);

											const targetWidth =
												mode === 'source'
													? liveSourceRect.width
													: mode === 'track'
														? draggedClip.data.duration * zoom
														: nameWidth + floatingHeight + 15;

											const targetHeight =
												mode === 'source'
													? liveSourceRect.height
													: mode === 'track'
														? mouseTrack!.track.height - 8
														: floatingHeight;

											xEase = updateEase(xEase, mode === 'source' ? 0.25 : 1);
											yEase = updateEase(
												yEase,
												mode === 'source' ? 0.25 : mode === 'track' ? 0.3 : 1
											);
											widthEase = updateEase(
												widthEase,
												mode === 'source' ? 0.25 : mode === 'track' ? 0.3 : 0.2
											);
											heightEase = updateEase(
												heightEase,
												mode === 'source' ? 0.25 : mode === 'track' ? 0.3 : 0.2
											);

											draggedClip.x += (targetX - draggedClip.x) * xEase;
											draggedClip.y += (targetY - draggedClip.y) * yEase;
											draggedClip.width += (targetWidth - draggedClip.width) * widthEase;
											draggedClip.height += (targetHeight - draggedClip.height) * heightEase;

											draggedClip.rotateCenterX = $mouseX - draggedClip.x;
											draggedClip.rotateCenterY = $mouseY - draggedClip.y;

											draggedClipId = clip.id;

											draggedClip.floating = mode === 'floating';

											const timestamp = getTimestampAtScreenX(
												$mouseX - draggedClip.width * startOffsetWidthPercent
											);

											setClipById(clip.id, {
												track: mouseTrack?.track.id ?? 'secret',
												start: mouseTrack ? timestamp : Number.MIN_SAFE_INTEGER
											});
										});
										clips.push(clip);

										onMouseUp(() => {
											resetCursor();
											stopDragging();
											const mouseTrack = getTrackAtMouse();
											if (!mouseTrack) {
												throwClipAcrossScreenReallyCoolAmazing(draggedClip);
												draggedClipId = null;
												deleteClipById(clip.id);
												return;
											}
											const timestamp = getTimestampAtScreenX(
												$mouseX - draggedClip.width * startOffsetWidthPercent
											);
											setClipById(clip.id, {
												track: mouseTrack.track.id,
												start: timestamp
											});
											draggedClipId = null;
										});
									}}
								>
									<div class="pointer-events-none flex w-full flex-row items-center gap-2">
										<div
											class="flex aspect-square h-full items-center justify-center overflow-hidden rounded-md"
										>
											{#if asset.previewUrl}
												<img
													src={asset.previewUrl}
													alt=""
													class="h-auto max-h-full w-auto max-w-full rounded-md"
												/>
											{/if}
										</div>
										<div class="flex flex-col items-start">
											<p>{asset.name}</p>
											<p class="text-xs text-muted-foreground">{$formatBytes(asset.size)}</p>
										</div>
									</div>
								</button>
							{/each}
						</div>
					</div>
				</Resizable.Pane>
			</Resizable.PaneGroup>
		</Resizable.Pane>
		<Resizable.Handle />
		<Resizable.Pane defaultSize={35} class="relative flex flex-col">
			<div class="flex w-full flex-row items-center justify-between px-5">
				<!-- left -->
				<Flex xCenter>
					<ButtonGroup.Root>
						<Button size="icon-sm">
							<MousePointer2 />
						</Button>
						<Button size="icon-sm" variant="outline">
							<TextCursor />
						</Button>
					</ButtonGroup.Root>
				</Flex>
				<!-- center -->
				<div class="flex h-8 flex-row items-center justify-center">
					<Button
						size="icon"
						variant="ghost"
						onclick={() => {
							if (playing) stop();
							else if (currentTimestamp === length) {
								// currentTimestamp = 0;
								movePlayheadTo(0);
							} else play();
						}}
					>
						{#if playing}
							<Pause />
						{:else if currentTimestamp === length}
							<SkipBack />
						{:else}
							<Play />
						{/if}
					</Button>

					<span
						class="relative top-0.5 flex h-5 items-center justify-center font-mono text-sm leading-none"
					>
						<span class="">
							{formatTimestamp(currentTimestamp)}
						</span>

						<span class="mx-2">/</span>

						<span class="">
							{formatTimestamp(length)}
						</span>
					</span>
				</div>
				<!-- right -->
				<div>c</div>
			</div>
			<div
				class="relative flex h-full w-full flex-col overflow-y-scroll"
				bind:this={timelineYScroll}
				onwheel={handleWheel}
			>
				<!-- <div class="pointer-events-none absolute top-4 left-0 z-30 w-full">
					{#each tracks as track}
						<div style="height: {track.height}px;"></div>
					{/each}

					<button
						class="pointer-events-auto flex h-12 w-full items-center gap-2 pl-5 text-sm text-muted-foreground"
						onclick={() => {
							tracks.push({
								height: 56,
								id: Date.now().toString(16)
							});
						}}
					>
						<Plus /> New Track
					</button>
				</div> -->

				<div class="relative h-full overflow-visible">
					<!-- <div
						class="absolute left-0 z-20 h-4 w-full bg-muted"
						style="top: {getScrollTop(frameNumber)}px"
					></div> -->
					<div class="relative h-full w-full px-15" bind:this={timelineXScroll}>
						<div
							class="relative flex min-h-full flex-col rounded-t-md border-x pt-4"
							style="width: {length * zoom}px;"
							bind:this={timelineDiv}
						>
							<ticks
								class="absolute left-0 z-20 h-4 w-full cursor-grab overflow-hidden rounded-t-md bg-muted active:cursor-grabbing"
								style="top: {getScrollTop(frameNumber)}px"
								onmousedown={() => {
									let lastMouseX = $mouseX;
									let lastMouseY = $mouseY;
									const startMouseX = $mouseX;
									const startMouseY = $mouseY;
									let targetScrollLeft = getScrollLeft();
									let targetZoom = zoom;
									const start = performance.now();
									const stopDragging = onAnimationFrame(() => {
										const deltaX = lastMouseX - $mouseX;
										const deltaY = lastMouseY - $mouseY;
										const absDeltaX = Math.abs(deltaX);
										const absDeltaY = Math.abs(deltaY);
										const dominantThreshold = 6;
										const scrollDominant = absDeltaX > absDeltaY * dominantThreshold;
										const zoomDominant = absDeltaY > absDeltaX * dominantThreshold;
										targetScrollLeft += deltaX;
										if (!playing) setScrollLeft(targetScrollLeft);
										lastMouseX = $mouseX;
										if (zoomDominant || (!scrollDominant && !zoomDominant && absDeltaY > 0)) {
											const oldZoom = zoom;
											targetZoom = targetZoom + curveZoomDelta(deltaY * 5);
											setZoom(targetZoom, () => {
												const target = playing ? playheadLeft - getScrollLeft() : $mouseX;
												console.log(target);
												const cursorTimestamp = (getScrollLeft() + target) / oldZoom;
												const newScrollLeft = cursorTimestamp * zoom - target;
												setScrollLeft(newScrollLeft);
												targetScrollLeft = newScrollLeft;
												lastMouseY = $mouseY;
											});
										}
									}, -100);
									onMouseUp(() => {
										const end = performance.now();
										if (
											end - start < 400 &&
											Math.abs(startMouseX - $mouseX) < 5 &&
											Math.abs(startMouseY - $mouseY) < 5
										) {
											movePlayheadTo(getTimestampAtMouse());
										}
										stopDragging();
									});
								}}
							>
								{#each ticks as Tick[] as tick (tick.stamp)}
									<tick
										class={`
													pointer-events-none absolute top-0 bg-foreground select-none
													${tick.state === 'major' ? 'h-4 w-px opacity-100' : tick.state === 'intermediate' ? 'h-3 w-px opacity-85' : tick.state === 'minor' ? 'h-2 w-px opacity-50' : 'h-0 w-px opacity-0'}
												`}
										style={// `left:${tick.stamp * zoom}px;` +
										`left: 0px; ${`transform: translateX(${tick.stamp * zoom}px);`}` +
											'transition: height 250ms ease-in-out, opacity 250ms ease-in-out;'}
									>
										{#if tick.showStamp && !tick.stampOnLeft}
											<div
												class="absolute top-0 left-1 z-10 bg-muted text-xs whitespace-nowrap opacity-80"
												transition:slide={{ axis: 'x' }}
											>
												{formatTimelineTimestamp(tick.stamp)}
											</div>
										{/if}
										{#if tick.showStamp && tick.stampOnLeft}
											<div
												class="absolute top-0 right-1 z-10 bg-muted text-xs whitespace-nowrap opacity-80"
												transition:slide={{ axis: 'x' }}
											>
												{formatTimelineTimestamp(tick.stamp)}
											</div>
										{/if}
									</tick>
								{/each}
							</ticks>
							<!-- #region tracks -->
							<tracks class="relative w-full bg-popover" bind:this={tracksDiv}>
								{#each ticks as tick (tick.stamp)}
									<tick
										class={`full pointer-events-none absolute top-0
														 z-10 h-full -translate-x-1/2 bg-foreground select-none
														${tick.state === 'major' ? 'w-px opacity-5' : tick.state === 'intermediate' ? 'w-px opacity-2' : tick.state === 'minor' ? 'w-px opacity-0' : 'w-px opacity-0'}
													`}
										style={// `left:${tick.stamp * zoom}px;` +
										` ${`transform: translateX(${tick.stamp * zoom}px);`}` +
											'transition: height 250ms ease-in-out, opacity 250ms ease-in-out;'}
									>
									</tick>
								{/each}
								{#each tracks as track, i}
									<div class="relative w-full" style="height: {track.height}px;" transition:slide>
										{#each clips as clipData}
											{#if clipData.track === track.id && draggedClipId !== clipData.id}
												<!-- #region clips -->
												<div
													role="none"
													class="absolute top-0 h-full cursor-grab py-1"
													style="
														left: {clipData.start * zoom}px;
														width: {clipData.duration * zoom}px;
													"
													in:receive={{ key: clipData.id }}
													out:send={{ key: clipData.id }}
													onmousedown={(e) => {
														const offset = e.offsetX;
														const offsetSeconds = e.offsetX / zoom;
														const offsetY = e.offsetY;
														const startTrack = clipData.track;
														const startStart = clipData.start;
														const clipWidth = clipData.duration * zoom;
														const startOffsetWidthPercent = offset / clipWidth;
														const grabOffsetFromCenter = startOffsetWidthPercent - 0.5;
														const resetCursor = setCursor('grabbing');

														draggedClip = {
															data: clipData,
															x: $mouseX - offset,
															y: getTrackScreenInfo(track.id)?.screenY ?? $mouseY + 4,
															height: track.height - 8,
															width: clipWidth,
															rotation: 0,
															rotateCenterX: offset,
															rotateCenterY: offsetY,
															floating: false
														};

														function getText() {
															switch (clipData.type) {
																case clipType.image:
																case clipType.audio:
																case clipType.video:
																	return clipData.name ?? media.assets[clipData.assetId ?? 0].name;

																case clipType.text:
																	return clipData.name ?? clipData.text ?? 'Text';
																case clipType.solid:
																	return clipData.name ?? `Color ${clipData.color}`;
															}
														}

														const nameWidth = (measureText(getText())?.width ?? 200) + 26;
														const floatingHeight = 40;

														let xEase = 1;
														let yEase = 0.4;
														let widthEase = 1;
														let heightEase = 0.4;

														let omega = 0;
														let theta = 0;
														let prevMouseX = $mouseX;
														let prevMouseY = $mouseY;

														const updateEase = (
															current: number,
															target: number,
															rampUp = 0.1,
															rampDown = 1
														) =>
															current + (target - current) * (target < current ? rampDown : rampUp);

														const grabOffsetFromCenterY = offsetY / (track.height - 8) - 0.5;

														const baseAngle =
															-grabOffsetFromCenter * 18 * (1 + grabOffsetFromCenterY * 0.2);

														const stopDragging = onAnimationFrame(() => {
															const mouseTrack = getTrackAtMouse();
															const mode = mouseTrack ? 'track' : 'floating';

															const dX = $mouseX - prevMouseX;
															const dY = $mouseY - prevMouseY;
															prevMouseX = $mouseX;
															prevMouseY = $mouseY;

															const widthScale = widthNorm / Math.max(draggedClip.width, 40);

															if (mode === 'floating') {
																const torqueX = dX * drive * widthScale;
																const torqueY = dY * grabOffsetFromCenter * drive * widthScale;
																omega += torqueX + torqueY * 6;
																omega -= (theta - baseAngle) * restoring;
																omega *= damp;
															} else {
																omega *= 0.01;
																omega -= theta * 0.18;
																omega *= damp;
															}

															theta = Math.max(-maxAngle, Math.min(maxAngle, theta + omega));
															draggedClip.rotation = theta;

															const targetX = $mouseX - draggedClip.width * startOffsetWidthPercent;
															const targetY =
																mode === 'track'
																	? mouseTrack!.screenY + 4
																	: $mouseY - offsetY * (floatingHeight / track.height);
															const targetWidth =
																mode === 'track'
																	? draggedClip.data.duration * zoom
																	: nameWidth + floatingHeight + 15;
															const targetHeight =
																mode === 'track' ? mouseTrack!.track.height - 8 : floatingHeight;

															xEase = updateEase(xEase, 1);
															yEase = updateEase(yEase, mode === 'track' ? 0.3 : 1);
															widthEase = updateEase(widthEase, mode === 'track' ? 0.3 : 0.2);
															heightEase = updateEase(heightEase, mode === 'track' ? 0.3 : 0.2);

															draggedClip.x += (targetX - draggedClip.x) * xEase;
															draggedClip.y += (targetY - draggedClip.y) * yEase;
															draggedClip.width += (targetWidth - draggedClip.width) * widthEase;
															draggedClip.height +=
																(targetHeight - draggedClip.height) * heightEase;

															draggedClip.rotateCenterX =
																draggedClip.width * startOffsetWidthPercent;
															draggedClip.rotateCenterY = $mouseY - draggedClip.y;
															draggedClip.floating = mode === 'floating';

															draggedClipId = clipData.id;

															setClipById(clipData.id, {
																track: mouseTrack?.track.id ?? startTrack,
																start: !mouseTrack?.track.id
																	? startStart
																	: getTimestampAtMouse() - offsetSeconds
															});
														});

														onMouseUp(() => {
															const mouseTrack = getTrackAtMouse();
															// todo setting
															resetCursor();
															if (true) {
																if (mouseTrack) {
																	setClipById(clipData.id, {
																		track: mouseTrack?.track.id,
																		start: getTimestampAtMouse() - offsetSeconds
																	});
																} else {
																	deleteClipById(clipData.id);
																	throwClipAcrossScreenReallyCoolAmazing(draggedClip);
																}
															} else {
																setClipById(clipData.id, {
																	track: mouseTrack?.track.id ?? startTrack,
																	start: !mouseTrack?.track.id
																		? startStart
																		: getTimestampAtMouse() - offsetSeconds
																});
															}
															clipLogger('stopped dragging');
															stopDragging();
															draggedClipId = null;
														});
													}}
												>
													<Clip
														clip={clipData}
														{zoom}
														bounds={getClipBounds(clipData, frameNumber)}
														inTimeline={true}
													/>
												</div>
											{/if}
										{/each}
									</div>
									<div
										class="relative -mt-1 h-1 w-full cursor-ns-resize border-b"
										onmousedown={() => {
											let lastMouseY = $mouseY;
											let targetHeight = track.height;
											const stopDragging = onAnimationFrame(() => {
												const deltaY = lastMouseY - $mouseY;
												targetHeight -= deltaY;
												tracks[i].height = clamp(16, 128, targetHeight);
												console.log(targetHeight);
												lastMouseY = $mouseY;
											}, -100);
											onMouseUp(() => {
												stopDragging();
											});
										}}
									></div>
								{/each}
							</tracks>

							<!-- <div class="h-12"></div> -->
							<svelte:boundary>
								{@const left = getScrollLeft(frameNumber)}
								<button
									class="pointer-events-auto relative -ml-15 flex h-12 w-[calc(100%+60px)] items-center gap-2 bg-transparent pl-15 text-sm text-muted-foreground transition-[background-color] hover:border-y hover:bg-popover/60"
									onclick={() => {
										tracks.push({
											height: 56,
											id: Date.now().toString(16)
										});
									}}
								>
									<div class="h-full w-full border-b bg-popover/50"></div>
									<Plus
										class="absolute left-0"
										style="
											margin-left: {left + scalenum(left, 0, 30, 200, 20, true, 'ease-out')}px;
											transform: translateX(-50%);
										"
									/>
									<span
										class="absolute left-0"
										style="
											margin-left: {left + scalenum(left, 0, 75, 200, 40, true, 'ease-out')}px;
										">New Track</span
									>
								</button>
							</svelte:boundary>

							<!-- #region playhead -->
							<playhead
								role="button"
								tabindex="0"
								class="absolute top-0 left-0 z-30 flex h-full w-1 -translate-x-1/2 {playheadOffscreenOffset ===
								0
									? 'cursor-ew-resize'
									: 'cursor-pointer'} flex-col items-center"
								onmousedown={() => {
									if (playheadOffscreenDirection === 0) {
										stop();
										playheadDragged = true;
										onMouseUp(() => {
											playheadDragged = false;
										});
									} else {
										timelineXScroll.scrollTo({
											left: currentTimestamp * zoom - $mouseX,
											behavior: 'smooth'
										});
									}
								}}
								// style={`left:${timelineContainer.scrollLeft * zoom}px;`}
								style={`transform: translateX(${playheadLeft}px); opacity: ${playheadDragged ? 45 : 100}%; transition: opacity 100ms ease-out;`}
								onwheel={(e: any) => {
									e.preventDefault();
									if (e.ctrlKey) {
										handleWheel(e);
										return;
									}
									setScrollLeft(getScrollLeft() + e.deltaY + e.deltaX);
									lastUserScrollTime = performance.now();
									userScrolling = true;
								}}
								// style={`left:6px;`}
							>
								<div style="transform: translateY({getScrollTop(frameNumber)}px);">
									<svg
										class="h-4 w-3"
										viewBox="0 0 8 12"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
										style="transform: translateY({playheadDragged
											? -10
											: -4}px); transition: transform 100ms ease-out;"
									>
										<g>
											<path
												d="M4 12C4 12 8 9.5 8 8.00001V4.00001V2.00001V1.00001C8 0.45 7.55 1.01175e-05 7 1.01175e-05C6.60948 0.000422135 6 1.01175e-05 6 1.01175e-05H4H2H1C0.45 1.19406e-05 0 0.45 0 1.00001V2.00001V4.00001V8.00001C0 9.5 4 12 4 12Z"
												fill="var(--playhead)"
											/>
										</g>
									</svg>
								</div>
								<div class="-mt-4 h-full w-px -translate-x-1/4 bg-playhead"></div>
							</playhead>
							{#if playheadOffscreenDirection !== 0}
								<button
									aria-label="go to playhead"
									onclick={() => {
										const timelineRect = timelineDiv.getBoundingClientRect();
										const offset = timelineRect.x + getScrollLeft();
										setScrollLeft(currentTimestamp * zoom - $mouseX + offset, true);
									}}
									class="absolute z-20 h-4 w-auto"
									style="top: {getScrollTop(frameNumber)}px;rotate: {playheadOffscreenDirection < 0
										? '0deg'
										: '180deg'}; left: {getScrollLeft(frameNumber) -
										timelineLeftPad +
										playheadOffscreenDirection * playheadOffscreenOffset +
										(playheadOffscreenDirection < 0 ? getContainerWidth(frameNumber) - 16 : 0)}px;"
								>
									<svg
										viewBox="0 0 61 88"
										class="h-full"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M0.0838685 5.15191C-0.809299 0.92232 5.64164 -1.72657 9.44945 1.30621L58.7298 40.5561C60.8898 42.2765 60.8898 45.0658 58.7298 46.7862L9.44945 86.0361C5.64164 89.0688 -0.809302 86.42 0.0838659 82.1904L8.06372 44.4018C8.16587 43.9181 8.16587 43.4242 8.06372 42.9405L0.0838685 5.15191Z"
											fill="var(--playhead)"
										/>
									</svg>
								</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</Resizable.Pane>
	</Resizable.PaneGroup>
	<!-- #region dragged clip -->

	{#if draggedClipId}
		<div
			class="absolute z-80 cursor-grabbing"
			style="
					top:{draggedClip.y}px;
		    	left:{draggedClip.x}px;
	       	height:{draggedClip.height}px;
		     	width:{draggedClip.width}px;
		    	rotate:{draggedClip.rotation}deg;
					transform-origin:{draggedClip.rotateCenterX}px {draggedClip.rotateCenterY}px;
			"
			in:receive={{ key: draggedClip.data.id, duration: 0 }}
			out:send={{ key: draggedClip.data.id }}
			onwheel={(e: any) => {
				e.preventDefault();
				if (e.ctrlKey) {
					handleWheel(e);
					return;
				}
				setScrollLeft(getScrollLeft() + e.deltaY + e.deltaX);
				lastUserScrollTime = performance.now();
				userScrolling = true;
			}}
		>
			<Clip clip={draggedClip.data} />
		</div>
	{/if}

	{#each Object.entries(pseudoClips) as [k, pClip] (pClip.data.id)}
		<div
			class="absolute z-80 cursor-grab"
			style="
					top:{pClip.y}px;
		    	left:{pClip.x}px;
	       	height:{pClip.height}px;
		     	width:{pClip.width}px;
		    	rotate:{pClip.rotation}deg;
					transform-origin:{pClip.rotateCenterX}px {pClip.rotateCenterY}px;
					opacity: {pClip.opacity}
			"
			onmousedown={(e) => {
				e.stopPropagation();

				const clip = pClip.data;

				const startX = pClip.x;
				const startY = pClip.y;
				const startWidth = pClip.width;
				const startHeight = pClip.height;
				const normalizeAngle = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;
				const startRotation = normalizeAngle(pClip.rotation);

				const rotateCenterScreenX = startX + pClip.rotateCenterX;
				const rotateCenterScreenY = startY + pClip.rotateCenterY;

				const dx = $mouseX - rotateCenterScreenX;
				const dy = $mouseY - rotateCenterScreenY;

				const rad = (startRotation * Math.PI) / 180;
				const cos = Math.cos(-rad);
				const sin = Math.sin(-rad);
				const localX = dx * cos - dy * sin;
				const localY = dx * sin + dy * cos;

				const mouseOffsetX = localX + pClip.rotateCenterX;
				const mouseOffsetY = localY + pClip.rotateCenterY;
				const startOffsetWidthPercent = mouseOffsetX / startWidth;
				const grabOffsetFromCenter = startOffsetWidthPercent - 0.5;
				const grabOffsetFromCenterY = mouseOffsetY / startHeight - 0.5;

				delete pseudoClips[k];

				clip.start = Number.MIN_SAFE_INTEGER;
				clip.track = 'secret';
				clips.push(clip);

				draggedClip = {
					data: clip,
					x: startX,
					y: startY,
					width: startWidth,
					height: startHeight,
					rotation: startRotation,
					rotateCenterX: mouseOffsetX,
					rotateCenterY: mouseOffsetY,
					floating: true
				};
				draggedClipId = clip.id;

				const resetCursor = setCursor('grabbing');

				const clipName = (() => {
					switch (clip.type) {
						case clipType.image:
						case clipType.audio:
						case clipType.video:
							return clip.name ?? media.assets[clip.assetId ?? 0]?.name ?? 'Clip';
						case clipType.text:
							return clip.name ?? clip.text ?? 'Text';
						case clipType.solid:
							return clip.name ?? `Color ${clip.color}`;
						default:
							return 'Clip';
					}
				})();
				const nameWidth = (measureText(clipName)?.width ?? 200) + 26;
				const floatingHeight = 40;

				let xEase = 1;
				let yEase = 1;
				let widthEase = 1;
				let heightEase = 1;

				let omega = 0;
				let theta = startRotation;
				let prevMouseX = $mouseX;
				let prevMouseY = $mouseY;

				const baseAngle = -grabOffsetFromCenter * 18 * (1 + grabOffsetFromCenterY * 0.2);
				const offsetSeconds = startOffsetWidthPercent * clip.duration;

				const updateEase = (current: number, target: number, rampUp = 0.1, rampDown = 1) =>
					current + (target - current) * (target < current ? rampDown : rampUp);

				const stopDragging = onAnimationFrame(() => {
					const mouseTrack = getTrackAtMouse();
					const mode = mouseTrack ? 'track' : 'floating';

					const dX = $mouseX - prevMouseX;
					const dY = $mouseY - prevMouseY;
					prevMouseX = $mouseX;
					prevMouseY = $mouseY;

					const widthScale = widthNorm / Math.max(draggedClip.width, 40);

					if (mode === 'floating') {
						const torqueX = dX * drive * widthScale;
						const torqueY = dY * grabOffsetFromCenter * drive * widthScale;
						omega += torqueX + torqueY * 6;
						omega -= (theta - baseAngle) * restoring;
						omega *= damp;
					} else {
						omega *= 0.01;
						omega -= theta * 0.18;
						omega *= damp;
					}

					theta += omega;
					draggedClip.rotation = theta;

					const targetX = $mouseX - draggedClip.width * startOffsetWidthPercent;
					const targetY =
						mode === 'track'
							? mouseTrack!.screenY + 4
							: $mouseY - mouseOffsetY * (floatingHeight / startHeight);
					const targetWidth =
						mode === 'track' ? draggedClip.data.duration * zoom : nameWidth + floatingHeight + 15;
					const targetHeight = mode === 'track' ? mouseTrack!.track.height - 8 : floatingHeight;

					xEase = updateEase(xEase, 1);
					yEase = updateEase(yEase, mode === 'track' ? 0.3 : 1);
					widthEase = updateEase(widthEase, mode === 'track' ? 0.3 : 0.2);
					heightEase = updateEase(heightEase, mode === 'track' ? 0.3 : 0.2);

					draggedClip.x += (targetX - draggedClip.x) * xEase;
					draggedClip.y += (targetY - draggedClip.y) * yEase;
					draggedClip.width += (targetWidth - draggedClip.width) * widthEase;
					draggedClip.height += (targetHeight - draggedClip.height) * heightEase;

					draggedClip.rotateCenterX = $mouseX - draggedClip.x;
					draggedClip.rotateCenterY = $mouseY - draggedClip.y;
					draggedClip.floating = mode === 'floating';

					draggedClipId = clip.id;

					setClipById(clip.id, {
						track: mouseTrack?.track.id ?? 'secret',
						start: mouseTrack ? getTimestampAtMouse() - offsetSeconds : Number.MIN_SAFE_INTEGER
					});
				});

				onMouseUp(() => {
					resetCursor();
					stopDragging();
					const mouseTrack = getTrackAtMouse();
					if (!mouseTrack) {
						throwClipAcrossScreenReallyCoolAmazing(draggedClip);
						draggedClipId = null;
						deleteClipById(clip.id);
						return;
					}
					setClipById(clip.id, {
						track: mouseTrack.track.id,
						start: getTimestampAtMouse() - offsetSeconds
					});
					draggedClipId = null;
				});
			}}
		>
			<Clip clip={pClip.data} />
		</div>
	{/each}

	<div
		class="pointer-events-none absolute bottom-0 left-0 flex w-full flex-col items-center justify-end"
	>
		{#if $activeChord}
			<div
				transition:fly={{ duration: 150, y: '20px' }}
				class="flex flex-col gap-2 transition-all"
				style:transform="translateY(-20px)"
			>
				<div
					class="mb-1 flex flex-col items-stretch overflow-hidden rounded-lg border bg-popover/80 backdrop-blur-2xl transition-all"
					style:opacity={$activeChord?.length && lastChordHints.length > 0 ? '1' : '0'}
					style:pointer-events="none"
				>
					{#each lastChordHints as hint, i}
						<div
							class="flex items-center justify-between gap-3 px-3 py-1.5 text-sm
									 {i !== lastChordHints.length - 1 ? 'border-b border-border/50' : ''}"
						>
							<Kbd keys={hint.remainingSteps} down={false} scale={1} />
							<span class="flex min-w-0 flex-col">
								<span class="truncate leading-tight font-medium text-foreground">
									{hint.definition.name}
								</span>
								{#if hint.definition.description}
									<span class="truncate text-xs leading-tight text-muted-foreground">
										{hint.definition.description}
									</span>
								{/if}
							</span>
						</div>
					{/each}
				</div>
				<div class="flex">
					<div
						class="flex h-7 items-center justify-center rounded-md border bg-popover/50 px-2 py-6 pb-1 backdrop-blur-2xl transition-transform"
					>
						<Kbd keys={$activeChord ?? lastChord ?? []} down={false} scale={1.4} />
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<input
	type="file"
	multiple
	accept="image/*,video/*,audio/*"
	hidden
	bind:this={fileInput}
	onchange={(e) => {
		const files = (e.currentTarget as HTMLInputElement).files;

		if (files) {
			media.import(files);
		}
	}}
/>

<input
	type="file"
	hidden
	bind:this={importInput}
	onchange={(e) => {
		const files = (e.currentTarget as HTMLInputElement).files;
		const file = files?.[0];
		if (file) {
			projects.importBundle(file);
		}
	}}
/>

<style>
	#loading-text {
		:nth-child(1) {
			animation: bouncy 2s ease-in-out infinite;
		}
		:nth-child(2) {
			animation: bouncy 2s ease-in-out infinite 400ms;
		}
		:nth-child(3) {
			animation: bouncy 2s ease-in-out infinite 800ms;
		}
	}

	@keyframes bouncy {
		0% {
			transform: translateY(0px);
		}
		40% {
			transform: translateY(-2px);
		}
		80% {
			transform: translateY(0);
		}
	}
</style>
