import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { OPFS, type ByteWriter } from './OPFS';
import {
	media,
	exportBundle,
	readBundleManifest,
	writeBundleToOPFS,
	type BundleManifest
} from './assets';
import promptFor from '$lib/popups';
import { createLogger } from '$lib/debug';

const projectsLogger = createLogger('projects');

type ProjectsState = {
	projects: string[];
	current: string;
};

const state = writable<ProjectsState>({
	projects: [],
	current: ''
});

function sorted(names: string[]): string[] {
	return [...new Set(names)].sort();
}

async function isProjectEmpty(name: string): Promise<boolean> {
	try {
		const text = await OPFS.readText(`/projects/${name}/project.json`);
		const manifest = JSON.parse(text) as BundleManifest;
		return manifest.assets.length === 0;
	} catch {
		return true;
	}
}

async function resolveUntitledName(existingProjects: string[]): Promise<string> {
	const candidates = ['untitled', ...Array.from({ length: 98 }, (_, i) => `untitled ${i + 2}`)];

	for (const name of candidates) {
		if (!existingProjects.includes(name)) return name;
		if (await isProjectEmpty(name)) return name;
	}

	return `untitled ${Date.now()}`;
}

export const projects = {
	subscribe: state.subscribe,

	get current(): string {
		return get(state).current;
	},

	get all(): string[] {
		return get(state).projects;
	},

	async refresh(): Promise<string[]> {
		try {
			const entries = await OPFS.listDirectory('/projects');
			const names = sorted(entries.filter((e) => e.isDirectory).map((e) => e.name));
			projectsLogger('found', names.length, 'projects');

			state.update((s) => ({ ...s, projects: names }));

			return names;
		} catch {
			state.update((s) => ({ ...s, projects: [] }));
			return [];
		}
	},

	async open(name: string): Promise<void> {
		projectsLogger('opening', name);

		const manifestText = await OPFS.readText(`/projects/${name}/project.json`);
		const manifest = JSON.parse(manifestText) as BundleManifest;

		if (await OPFS.existsDirectory('/assets')) await OPFS.delete('/assets');

		try {
			await OPFS.copyDirectory(`/projects/${name}/assets`, '/assets');
		} catch {}

		await media.openProject(manifest);

		state.update((s) => ({ ...s, current: name }));
		projectsLogger('opened', name);
	},

	async openBlank(): Promise<void> {
		projectsLogger('opening blank');

		const manifest = {
			assets: [],
			name: 'untitled',
			version: 1
		} as BundleManifest;

		if (await OPFS.existsDirectory('/assets')) await OPFS.delete('/assets');

		await media.openProject(manifest);
		const entries = await OPFS.listDirectory('/projects').catch(() => []);
		const names = sorted(entries.filter((e) => e.isDirectory).map((e) => e.name));
		const initialName = await resolveUntitledName(names);

		state.update((s) => ({ ...s, current: initialName }));
		projectsLogger('opened blank');
	},

	async save(): Promise<void> {
		const name = get(state).current;
		projectsLogger('saving', name);

		const assets = Object.values(media.assets);

		for (const asset of assets) {
			projectsLogger('copying', asset.name, 'to project store');
			await OPFS.copy(`/assets/${asset.id}`, `/projects/${name}/assets/${asset.id}`);
		}

		const manifest: BundleManifest = {
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

		await OPFS.write(`/projects/${name}/project.json`, JSON.stringify(manifest));

		state.update((s) => ({
			...s,
			projects: sorted([...s.projects, name])
		}));

		projectsLogger('saved', name, 'with', assets.length, 'assets');
	},

	async delete(name: string): Promise<void> {
		projectsLogger('deleting', name);
		await OPFS.delete(`/projects/${name}`);
		state.update((s) => ({
			...s,
			projects: s.projects.filter((p) => p !== name),
			current: s.current === name ? 'untitled' : s.current
		}));
	},

	async rename(oldName: string, newName: string): Promise<void> {
		const trimmed = newName.trim();
		if (!trimmed) throw new Error('Project name cannot be empty');

		if (get(state).projects.includes(trimmed)) {
			throw new Error(`A project named "${trimmed}" already exists`);
		}

		if (await OPFS.existsDirectory(`/projects/${oldName}`)) {
			projectsLogger('renaming', oldName, 'to', trimmed);
			await OPFS.moveDirectory(`/projects/${oldName}`, `/projects/${trimmed}`);

			const manifestText = await OPFS.readText(`/projects/${trimmed}/project.json`);
			const manifest = JSON.parse(manifestText) as BundleManifest;
			manifest.name = trimmed;
			await OPFS.write(`/projects/${trimmed}/project.json`, JSON.stringify(manifest));
		}

		state.update((s) => ({
			...s,
			projects: sorted(s.projects.map((p) => (p === oldName ? trimmed : p))),
			current: s.current === oldName ? trimmed : s.current
		}));

		projectsLogger('renamed', oldName, 'to', trimmed);
	},

	async importBundle(file: File): Promise<{ name: string; assetCount: number } | null> {
		projectsLogger('reading manifest from bundle');
		const manifest = await readBundleManifest(file);
		let targetName = manifest.name;

		const exists = await OPFS.existsDirectory(`/projects/${targetName}`);

		if (exists) {
			projectsLogger('name conflict on', targetName);
			const currentProjects = get(state).projects;

			const { value } = await promptFor('textInputPrompt', {
				title: 'Project already exists',
				description: `A project named "${targetName}" already exists. Keep the name to overwrite it, or rename to import as a new project.`,
				cancelText: 'Cancel',
				default: targetName,
				valid(v) {
					const t = v.trim();
					if (!t) return false;
					if (t === manifest.name) return true;
					return !currentProjects.includes(t);
				}
			}).catch(() => ({ value: null }));

			if (!value) {
				projectsLogger('import cancelled');
				return null;
			}

			targetName = value.trim();

			if (targetName === manifest.name) {
				projectsLogger('overwriting', targetName);
				await OPFS.delete(`/projects/${targetName}`);
			}
		}

		const root = `/projects/${targetName}`;
		projectsLogger('extracting to', root);
		const extracted = await writeBundleToOPFS(file, root);

		state.update((s) => ({
			...s,
			projects: sorted([...s.projects, targetName])
		}));

		projectsLogger('imported', targetName, 'with', extracted.assets.length, 'assets');
		return { name: targetName, assetCount: extracted.assets.length };
	},

	async exportBundle(writer: ByteWriter): Promise<void> {
		const name = get(state).current;
		projectsLogger('exporting', name);
		await exportBundle(writer, name);
	},

	async downloadBundle(): Promise<void> {
		if (!browser) throw new Error('downloadBundle must be called in the browser');

		const name = get(state).current;
		projectsLogger('downloading bundle for', name);

		const streamSaver = (await import('streamsaver')).default;
		const fileStream = streamSaver.createWriteStream(`${name}.snipkit`);
		const writer = fileStream.getWriter();

		try {
			await exportBundle(writer, name);
		} catch (err) {
			writer.abort();
			throw err;
		}
	}
};
