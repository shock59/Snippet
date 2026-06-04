import { writable } from 'svelte/store';
import { createLogger } from './debug';
import type { TimelineClip } from './media/types';

const prompts = ['confirmation', 'objectViewer', 'textInputPrompt', 'renderOptions'] as const;

export const promptOpen = writable(false);

type PromptType = (typeof prompts)[number];

type PromptParamsMap = {
	confirmation: {
		title: string;
		description?: string;
		confirmText?: string;
		confirmCountdown?: number;
		confirmVariant?: 'default' | 'destructive';

		cancelText?: string;
	};
	objectViewer: {
		object: unknown;
	};
	textInputPrompt: {
		title: string;
		description?: string;
		confirmText?: string;
		confirmVariant?: 'default' | 'destructive';
		cancelText?: string;
		default?: string;
		valid?: (v: string) => boolean;
	};
	renderOptions: {
		clips: TimelineClip[];
		options: {
			fps: number;
			width: number;
			height: number;
			length: number;
			progressWeights?: Partial<Record<'audio' | 'video' | 'preload' | 'finalize', number>>;
		};
	};
};

type PromptResultMap = {
	confirmation: {
		confirmed: boolean;
	};
	objectViewer: {};
	renderOptions: {};
	textInputPrompt: {
		value: string | null;
	};
};

const logger = createLogger('popups');

export type PromptInstance<T extends PromptType = PromptType> = {
	id: string;
	type: T;
	params: PromptParamsMap[T];
	preventClose: boolean;
};

export const activePrompts = writable<PromptInstance[]>([]);
let activePromptsStatic = [] as PromptInstance[];

export const activePrompt = writable<PromptInstance | null>(null);

activePrompts.subscribe((value) => {
	activePromptsStatic = value;
});

const resolvers = new Map<
	string,
	{
		resolve: (value: any) => void;
		reject: (reason?: any) => void;
		settled: boolean;
	}
>();

function randomId() {
	return crypto.randomUUID();
}

export function promptFor<T extends PromptType>(
	type: T,
	params: PromptParamsMap[T],
	preventClose = false
): Promise<PromptResultMap[T]> {
	const id = randomId();

	return new Promise<PromptResultMap[T]>((resolve, reject) => {
		//@ts-ignore
		logger('Showing', id);

		let settled = false;
		resolvers.set(id, {
			resolve: (value: PromptResultMap[T]) => {
				if (resolvers.get(id)?.settled) return;
				resolvers.set(id, { resolve, reject, settled: true });
				resolve(value);
				promptOpen.set(false);
			},
			reject: (reason?: any) => {
				if (resolvers.get(id)?.settled) return;
				resolvers.set(id, { resolve, reject, settled: true });
				reject(reason);
				promptOpen.set(false);
			},
			settled
		});

		activePrompts.update((p) => [...p, { id, type, params, preventClose }]);

		activePrompt.set({ id, type, params, preventClose });
		promptOpen.set(true);
	});
}
export default promptFor;

export function resolvePrompt<T extends PromptType>(id: string, value: PromptResultMap[T]) {
	logger('Resolving', id, value);
	const resolve = resolvers.get(id);
	if (!resolve) return;

	resolve.resolve(value);
}

export function rejectPrompt(id: string) {
	logger('Rejecting', id);
	const resolve = resolvers.get(id);
	if (!resolve) return;

	resolve.reject(null);
}

export function deletePrompt(id: string) {
	logger('Deleting', id);
	const resolve = resolvers.get(id);
	if (!resolve) return;
	if (!resolve.settled) {
		resolve.reject(null);
	}
	resolvers.delete(id);
	activePrompts.update((p) => p.filter((x) => x.id !== id));
	if (activePromptsStatic.length === 0) {
		promptOpen.set(false);
	}
	if (activePrompt) {
		activePrompt.set(null);
	}
	if (activePromptsStatic.length > 0) {
		activePrompt.set(activePromptsStatic[0]);
	}
}
