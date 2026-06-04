import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';

const stringToColor = (str: string) => {
	str += 'mendy';
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}

	const h = Math.abs(hash % 360) / 360;
	const s = Math.abs((hash >> 8) % 100) / 100;
	const l = (70 + Math.abs((hash >> 16) % 20)) / 100;

	let r = l,
		g = l,
		b = l;
	if (s !== 0) {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;

		const hue2rgb = (t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		r = hue2rgb(h + 1 / 3);
		g = hue2rgb(h);
		b = hue2rgb(h - 1 / 3);
	}

	const toHex = (x: number) =>
		Math.round(x * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

function stringToRange(str: string, min: number, max: number) {
	str += 'mendy';

	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}

	return (Math.abs(hash) % (max - min)) + min;
}

export type Shape =
	| 'rectangle'
	| 'slanted'
	| 'circle'
	| 'rounded'
	| 'angled'
	| 'saw'
	| 'inverseslanted'
	| 'inversesaw'
	| 'inverseangled'
	/**
	 * this ones just rectangle but is forced to overlap with the previous one
	 */
	| 'overlap';

const shapes: Shape[] = [
	'slanted',
	'circle',
	'rounded',
	'angled',
	'saw',
	'inversesaw',
	'inverseangled',
	'inverseslanted'
];

export type Content =
	| { type: 'text'; value: string }
	| { type: 'number'; value: number }
	| { type: 'boolean'; value: boolean }
	| { type: 'object'; value: unknown }
	| {
			type: 'error';
			value: {
				name: string;
				message: string;
				stack?: string;
			};
	  }
	| { type: 'null' }
	| { type: 'undefined' };

export type Source = {
	name: string;
	shapeLeft: Shape;
	shapeRight: Shape;
	color: string;
};

export type LogLevel = 'default' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type Log = {
	id: number;
	sources: Source[];
	content: Content[];
	level: LogLevel;
	timestamp: number;
};

export type SourceFilter = {
	enabled?: boolean;
	levels?: Partial<Record<LogLevel, boolean>>;
};

export type LogFilters = Record<string, SourceFilter>;

let nextId = 0;

export const logs = writable<Log[]>([]);

function getFiltersFromStorage() {
	if (!browser) return {};
	const stored = window.localStorage.getItem('log-filters');
	if (stored) return JSON.parse(stored);
	return {};
}

export const logFilters = writable<LogFilters>(getFiltersFromStorage());

if (browser)
	logFilters.subscribe((v) => {
		window.localStorage.setItem('log-filters', JSON.stringify(v));
	});

export const sourceRegistry = writable<Record<string, Source[]>>({});

export const loggerLogger = createLogger('logger', { color: '#73d66a' });

export function stringifySources(...sources: Source[]) {
	return sources.map((source) => [source.name].join('::')).join(';');
}

function registerSource(sources: Source[]) {
	const key = stringifySources(...sources);
	sourceRegistry.update((r) => {
		if (!r[key]) {
			r[key] = sources;
			queueMicrotask(() => {
				loggerLogger('registered source', key, sources);
			});
		}
		return r;
	});
}

function convertContent(value: unknown): Content {
	if (value === null) return { type: 'null' };
	if (value === undefined) return { type: 'undefined' };

	if (value instanceof Error) {
		return {
			type: 'error',
			value: {
				name: value.name,
				message: value.message,
				stack: value.stack
			}
		};
	}

	switch (typeof value) {
		case 'string':
			return { type: 'text', value };
		case 'number':
			return { type: 'number', value };
		case 'boolean':
			return { type: 'boolean', value };
		default:
			return { type: 'object', value };
	}
}

export type Logger = ((...args: unknown[]) => void) & {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
	fatal: (...args: unknown[]) => void;
	child: (name: string, options?: Partial<Omit<Source, 'name'>>) => Logger;
	sources: Source[];
};

function pushLog(level: LogLevel, sources: Source[], args: unknown[]) {
	console.log(sources.map((s) => s.name).join('/'), level, ...args);
	logs.update((v) => [
		...v,
		{
			id: nextId++,
			sources,
			level,
			timestamp: Date.now(),
			content: args.map(convertContent)
		}
	]);

	if (get(logs).length > 5000) {
		logs.update((v) => {
			v.shift();
			return v;
		});
	}
}

export function createLogger(name: string, options?: Partial<Omit<Source, 'name'>>): Logger {
	const sources: Source[] = [
		{
			name,
			shapeLeft: shapes[stringToRange(name, 0, shapes.length)],
			shapeRight:
				shapes[stringToRange(name + stringToRange(name, 0, shapes.length), 0, shapes.length)],
			color: stringToColor(name),
			...options
		}
	];
	return createLoggerFromSources(sources);
}

function createLoggerFromSources(sources: Source[]): Logger {
	registerSource(sources);

	function emit(level: LogLevel, args: unknown[]) {
		pushLog(level, sources, args);
	}

	const logger = ((...args: unknown[]) => {
		emit('default', args);
	}) as Logger;

	logger.sources = sources;
	logger.debug = (...args) => emit('debug', args);
	logger.info = (...args) => emit('info', args);
	logger.warn = (...args) => emit('warn', args);
	logger.error = (...args) => emit('error', args);
	logger.fatal = (...args) => emit('fatal', args);

	logger.child = (name, options = {}) => {
		const source: Source = {
			name,
			shapeLeft: options.shapeLeft ?? 'overlap',
			shapeRight: options.shapeRight ?? shapes[stringToRange(name, 0, shapes.length)],
			color: options.color ?? stringToColor(name)
		};

		return createLoggerFromSources([...sources, source]);
	};

	return logger;
}

export function matchesLogFilters(log: Log, filters: LogFilters = get(logFilters)) {
	const entries = Object.entries(filters);

	if (entries.length === 0) return true;

	const key = stringifySources(...log.sources);
	const filter = filters[key];

	if (!filter) return true;
	if (filter.enabled === false) return false;
	if (filter.levels?.[log.level] === false) return false;

	return true;
}
