import { browser } from '$app/environment';
import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { createLogger } from './debug';

export type KeybindToken = { type: 'key'; key: string } | { type: 'punctuation'; text: string };

export type KeybindStep = KeybindToken[];

export interface ParsedKeybind {
	raw: string;
	steps: KeybindStep[];
}

export interface KeybindDefinition {
	bind: string;
	name: string;
	description?: string;
}

export interface RegisteredKeybind {
	id: number;
	definition: KeybindDefinition;
	parsed: ParsedKeybind;
	callback: () => void;
}

export interface KeybindHint {
	definition: KeybindDefinition;
	prefixSteps: KeybindStep[];
	remainingSteps: KeybindStep[];
}

const kbdLogger = createLogger('keybind');
const keyLogger = kbdLogger.child('keys');

const aliases: Record<string, string> = {
	control: 'ctrl',
	altgraph: 'alt',
	escape: 'esc',
	' ': 'space',
	arrowup: 'up',
	arrowdown: 'down',
	arrowleft: 'left',
	arrowright: 'right',
	meta: 'meta',
	os: 'meta',
	return: 'enter'
};

const mod = ['ctrl', 'shift', 'alt', 'meta'];

const normalLogger = kbdLogger.child('normalizer');

function normalizeKey(key: string): string {
	const normalized = key.toLowerCase();
	normalLogger(key, normalized, 'alias', aliases[normalized]);
	return aliases[normalized] ?? normalized;
}

function sortCombo(keys: string[]): string[] {
	const priority = ['ctrl', 'shift', 'alt', 'meta'];
	return [...keys].sort((a, b) => {
		const ai = priority.indexOf(a);
		const bi = priority.indexOf(b);
		if (ai !== -1 || bi !== -1) {
			return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
		}
		return a.localeCompare(b);
	});
}

function comboToTokens(combo: string[]): KeybindStep {
	return combo.flatMap((key, i) => {
		const out: KeybindToken[] = [{ type: 'key', key }];
		if (i !== combo.length - 1) {
			out.push({ type: 'punctuation', text: '+' });
		}
		return out;
	});
}

const parser = kbdLogger.child('parser');

function parseKeybind(input: string): ParsedKeybind {
	const steps = input
		.trim()
		.split(/\s+/g)
		.map((part) => {
			const combo = sortCombo(
				part
					.split('+')
					.map((x) => normalizeKey(x.trim()))
					.filter(Boolean)
			);
			return comboToTokens(combo);
		});

	parser(input, steps);

	return { raw: input, steps };
}

function serializeStep(step: KeybindStep): string {
	return step
		.filter((x): x is Extract<KeybindToken, { type: 'key' }> => x.type === 'key')
		.map((x) => x.key)
		.join('+');
}

function serializeParsed(parsed: ParsedKeybind): string[] {
	return parsed.steps.map(serializeStep);
}

function startsWithSteps(full: string[], partial: string[]): boolean {
	if (partial.length > full.length) return false;
	for (let i = 0; i < partial.length; i++) {
		if (full[i] !== partial[i]) return false;
	}
	return true;
}

function endsWithSteps(history: string[], target: string[]): boolean {
	if (target.length > history.length) return false;
	const offset = history.length - target.length;
	for (let i = 0; i < target.length; i++) {
		if (history[offset + i] !== target[i]) return false;
	}
	return true;
}

const pressedKeys = writable<Set<string>>(new Set());

const activeChord = writable<KeybindStep[] | null>(null);

const registeredStore = writable<RegisteredKeybind[]>([]);

export const historyState: Writable<string[]> = writable([]);

export const chordHints: Readable<KeybindHint[]> = derived(
	[activeChord, registeredStore],
	([$chord, $registered]) => {
		if (!$chord || $chord.length === 0) return [];

		const prefixSerialized = $chord.map(serializeStep);

		return $registered.flatMap((bind) => {
			const steps = serializeParsed(bind.parsed);

			if (steps.length <= prefixSerialized.length) return [];
			if (!startsWithSteps(steps, prefixSerialized)) return [];

			const prefixSteps = bind.parsed.steps.slice(0, prefixSerialized.length);
			const remainingSteps = bind.parsed.steps.slice(prefixSerialized.length);

			return [{ definition: bind.definition, prefixSteps, remainingSteps }] satisfies KeybindHint[];
		});
	}
);

const registered: RegisteredKeybind[] = [];

const prefixRegistry = new Set<string>();

function rebuildPrefixRegistry() {
	kbdLogger('rebuilding prefix registry');
	prefixRegistry.clear();
	for (const bind of registered) {
		const steps = serializeParsed(bind.parsed);
		for (let i = 1; i <= steps.length; i++) {
			prefixRegistry.add(steps.slice(0, i).join(' '));
		}
	}
	kbdLogger('rebuilt prefix registry', [...prefixRegistry.values()]);
}

function syncRegisteredStore() {
	registeredStore.set([...registered]);
}

const history = {
	slice: (start?: number, end?: number) => {
		let out: string[] = null as any;
		historyState.update((s) => {
			out = s.slice(start, end);
			return s;
		});
		return out;
	},
	push: (...items: string[]) => {
		let out: number = null as any;
		historyState.update((s) => {
			out = s.push(...items);
			return s;
		});
		return out;
	},
	splice: (start: number, deleteCount?: number) => {
		let out: string[] = null as any;
		historyState.update((s) => {
			out = s.splice(start, deleteCount);
			return s;
		});
		return out;
	},
	get length() {
		return get(historyState).length;
	},
	set length(value) {
		historyState.update((s) => {
			s.length = value;
			return s;
		});
	},
	get v() {
		return get(historyState);
	}
};

let currentCombo = new Set<string>();
let nextId = 0;

function updatePressedKeys() {
	pressedKeys.set(new Set(currentCombo));
}

function updateActiveChord() {
	if (history.length === 0) {
		activeChord.set(null);
		return;
	}

	let bestMatch: string[] | null = null;

	for (const bind of registered) {
		const steps = serializeParsed(bind.parsed);
		for (let len = 1; len < steps.length; len++) {
			const slice = history.slice(-len);
			if (startsWithSteps(steps, slice)) {
				if (!bestMatch || slice.length > bestMatch.length) {
					bestMatch = slice;
				}
			}
		}
	}

	if (!bestMatch) {
		activeChord.set(null);
		return;
	}
	activeChord.set(bestMatch.map((step) => comboToTokens(step.split('+').filter(Boolean))));
}

function pushHistory(step: string) {
	history.push(step);
	const maxSteps = Math.max(1, ...registered.map((x) => x.parsed.steps.length));
	if (history.length > maxSteps) {
		history.splice(0, history.length - maxSteps);
	}
}

function handleStep(step: string) {
	pushHistory(step);

	let matched = false;
	for (const bind of registered) {
		const target = serializeParsed(bind.parsed);
		if (endsWithSteps(history.v, target)) {
			matched = true;
			bind.callback();
		}
	}

	if (matched) {
		activeChord.set(null);
		return;
	}
	updateActiveChord();
}

function onKeyDown(event: KeyboardEvent) {
	const key = normalizeKey(event.key);
	if (event.repeat) return;
	keyLogger('down', event.key);
	currentCombo.add(key);
	updatePressedKeys();

	const modifiers = [...currentCombo].filter((x) => mod.includes(x));
	const comboParts = key && !mod.includes(key) ? [...modifiers, key] : [];
	const combo = sortCombo(comboParts).join('+');
	if (!combo) return;

	const nextHistory = [...history.v, combo];
	const parts = combo.split('+');
	if (!parts.some((x) => !mod.includes(x))) return;

	const isPotentialBindStep = nextHistory.some((_, i) =>
		prefixRegistry.has(nextHistory.slice(i).join(' '))
	);
	keyLogger('prefixKey', nextHistory, isPotentialBindStep);

	if (isPotentialBindStep && event.cancelable) {
		keyLogger('canceled default');
		event.preventDefault();
	}

	handleStep(combo);
}

function onKeyUp(event: KeyboardEvent) {
	keyLogger('keyup', event.key);
	currentCombo.delete(normalizeKey(event.key));
	updatePressedKeys();
}

function resetKeyboardState() {
	currentCombo.clear();
	history.length = 0;
	updatePressedKeys();
	activeChord.set(null);
}

function onWindowBlur() {
	queueMicrotask(() => {
		if (!document.hasFocus()) {
			kbdLogger('document unfocused, resetting keys');
			resetKeyboardState();
		}
	});
}

function onVisibilityChange() {
	if (document.visibilityState === 'hidden') {
		kbdLogger('document unfocused, resetting keys');
		resetKeyboardState();
	}
}

const KEYBIND_STATE = Symbol.for('app.keybind.state');

type KeybindState = {
	attached: boolean;
	currentCombo: Set<string>;
	history: string[];
	registered: RegisteredKeybind[];
};

const state: KeybindState = ((globalThis as any)[KEYBIND_STATE] ??= {
	attached: false,
	currentCombo: new Set<string>(),
	history: [],
	registered: []
});

function attachListeners() {
	if (!browser || state.attached) return;

	window.addEventListener('keydown', onKeyDown, { capture: true });
	window.addEventListener('keyup', onKeyUp, { capture: true });
	window.addEventListener('blur', onWindowBlur);
	document.addEventListener('visibilitychange', onVisibilityChange);

	state.attached = true;

	import.meta.hot?.dispose(() => {
		window.removeEventListener('keydown', onKeyDown, { capture: true });
		window.removeEventListener('keyup', onKeyUp, { capture: true });
		window.removeEventListener('blur', onWindowBlur);
		document.removeEventListener('visibilitychange', onVisibilityChange);
		state.attached = false;
	});
}

if (browser) {
	attachListeners();
}

function registerKeybind(definition: KeybindDefinition, callback: () => void): () => void {
	kbdLogger('registering keybind', definition.bind, callback);

	let unregister: () => void = () => {};
	let stop = false;

	$effect(() => {
		if (stop) return;

		const parsed = parseKeybind(definition.bind);
		const serialized = serializeParsed(parsed);

		for (const existing of registered) {
			const existingSteps = serializeParsed(existing.parsed);
			if (startsWithSteps(serialized, existingSteps) && serialized.length > existingSteps.length) {
				throw new Error(
					`Cannot register "${definition.bind}" because "${existing.definition.bind}" already triggers earlier`
				);
			}
		}

		const item: RegisteredKeybind = { id: nextId++, definition, parsed, callback };

		registered.push(item);
		rebuildPrefixRegistry();
		syncRegisteredStore();

		unregister = () => {
			kbdLogger('unregistering keybind', definition.bind);
			const index = registered.findIndex((x) => x.id === item.id);
			if (index !== -1) registered.splice(index, 1);
			syncRegisteredStore();
			updateActiveChord();
		};

		return unregister;
	});

	return () => {
		stop = true;
		rebuildPrefixRegistry();
		unregister();
	};
}

export default {
	registerKeybind,
	pressedKeys,
	activeChord,
	chordHints,
	registeredStore,
	parseKeybind,
	serializeParsed
};
