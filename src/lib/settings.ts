import { browser } from '$app/environment';
import { writable, derived, get as storeGet, type Readable } from 'svelte/store';

const storageKey = 'app.settings';

export interface UISettings {
	theme: 'light' | 'dark' | 'system';
	hue: number;
}

export interface Settings {
	ui: UISettings;
}

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type DotPaths<T, Prefix extends string = ''> = {
	[K in keyof T & string]: T[K] extends object
		? `${Prefix}${K}` | DotPaths<T[K], `${Prefix}${K}.`>
		: `${Prefix}${K}`;
}[keyof T & string];

type DotPathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
	? K extends keyof T
		? DotPathValue<T[K], Rest>
		: never
	: P extends keyof T
		? T[P]
		: never;

export type SettingsPath = DotPaths<Settings>;

export type SettingsPathValue<P extends SettingsPath> = DotPathValue<Settings, P>;

export interface SettingsNamespace<T extends object> {
	subscribe: Readable<T>['subscribe'];
	get<P extends DotPaths<T>>(key: P): DotPathValue<T, P> | undefined;
	set<P extends DotPaths<T>>(key: P, value: DotPathValue<T, P>): void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce<unknown>((curr, key) => {
		if (!isRecord(curr)) return undefined;
		return curr[key];
	}, obj);
}

function deepSet(obj: any, path: string, value: unknown): any {
	const keys = path.split('.');
	const root: Record<string, unknown> = { ...obj };
	let node = root;

	for (let i = 0; i < keys.length - 1; i++) {
		const child = node[keys[i]];
		node[keys[i]] = isRecord(child) ? { ...child } : {};
		node = node[keys[i]] as Record<string, unknown>;
	}

	node[keys[keys.length - 1]] = value;
	return root;
}

const defaultSettings: Settings = {
	ui: {
		hue: 0,
		theme: 'system'
	}
};

function loadFromStorage(): Settings {
	if (!browser) return defaultSettings;
	try {
		const raw = localStorage.getItem(storageKey);
		const parsed = raw ? JSON.parse(raw) : defaultSettings;
		return isRecord(parsed) ? (parsed as unknown as Settings) : defaultSettings;
	} catch {
		return defaultSettings;
	}
}

const store = writable<Settings>(loadFromStorage());

if (browser) {
	store.subscribe((value) => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(value));
		} catch {}
	});
}

export const settings = {
	subscribe: store.subscribe,

	get<P extends SettingsPath>(path: P): SettingsPathValue<P> | undefined {
		return deepGet(storeGet(store) as unknown as Record<string, unknown>, path) as
			| SettingsPathValue<P>
			| undefined;
	},

	set<P extends SettingsPath>(path: P, value: SettingsPathValue<P>): void {
		store.update((s) => deepSet(s as unknown as Settings, path, value) as unknown as Settings);
	},

	load(data: DeepPartial<Settings>): void {
		store.set(isRecord(data) ? (data as any) : defaultSettings);
	},

	namespace<NS extends keyof Settings>(ns: NS): SettingsNamespace<Settings[NS]> {
		type T = Settings[NS];

		const slice = derived(store, ($s) => {
			const val = $s[ns];
			return (isRecord(val) ? val : {}) as unknown as T;
		});

		return {
			subscribe: slice.subscribe,

			get<P extends DotPaths<T>>(key: P): DotPathValue<T, P> | undefined {
				return settings.get(`${ns}.${key as string}` as SettingsPath) as
					| DotPathValue<T, P>
					| undefined;
			},

			set<P extends DotPaths<T>>(key: P, value: DotPathValue<T, P>): void {
				settings.set(
					`${ns}.${key as string}` as SettingsPath,
					value as SettingsPathValue<SettingsPath>
				);
			}
		};
	}
};

export default settings;
