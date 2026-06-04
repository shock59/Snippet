import { createLogger } from '$lib/debug';
import { formatBytes, ifBrowser } from '$lib/utils';

const OPFSLogger = createLogger('OPFS');

const pathResolveLogger = OPFSLogger.child('path resolver');

export interface WriteOptions {
	create?: boolean;
	append?: boolean;
}

export type ByteWriter = Pick<WritableStreamDefaultWriter<Uint8Array>, 'write' | 'close'>;

export class OPFSClass {
	root: Promise<FileSystemDirectoryHandle>;

	constructor() {
		OPFSLogger('OPFS root initializing');

		this.root = navigator.storage.getDirectory();
		this.root.then(() => {
			OPFSLogger('OPFS root initialized');
		});
	}

	private async resolvePath(
		path: string,
		create = false
	): Promise<{
		parent: FileSystemDirectoryHandle;
		name: string;
	}> {
		pathResolveLogger('resolving', path);
		const parts = path.split('/').filter(Boolean);
		const name = parts.pop();

		if (!name) {
			throw new Error(`Invalid path: "${path}"`);
		}

		let current = await this.root;

		for (const part of parts) {
			current = await current.getDirectoryHandle(part, { create });
		}

		return {
			parent: current,
			name
		};
	}

	async fileHandle(path: string, create = false) {
		OPFSLogger('creating file handle for', path);
		const { parent, name } = await this.resolvePath(path, create);

		return parent.getFileHandle(name, { create });
	}

	async delete(path: string) {
		OPFSLogger('deleting', path);

		const { parent, name } = await this.resolvePath(path);

		await parent.removeEntry(name, {
			recursive: true
		});
	}

	async exists(path: string) {
		try {
			const { parent, name } = await this.resolvePath(path);

			await parent.getFileHandle(name);
			OPFSLogger('exists', path);

			return true;
		} catch {
			OPFSLogger('doesnt exists', path);

			return false;
		}
	}

	async write(
		path: string,
		data: BufferSource | Blob | string | ReadableStream,
		options: WriteOptions = {}
	) {
		OPFSLogger('writing to', path);

		const handle = await this.fileHandle(path, options.create ?? true);

		const writable = await handle.createWritable({
			keepExistingData: options.append ?? false
		});

		if (options.append) {
			const file = await handle.getFile();
			await writable.seek(file.size);
		}

		if (data instanceof ReadableStream) {
			await data.pipeTo(writable);
			return;
		}

		await writable.write(data);
		await writable.close();
	}

	async writer(path: string, options: WriteOptions = {}): Promise<ByteWriter> {
		OPFSLogger('creating write handle for', path);

		const handle = await this.fileHandle(path, options.create ?? true);

		const writable = await handle.createWritable({
			keepExistingData: options.append ?? false
		});

		if (options.append) {
			const file = await handle.getFile();
			await writable.seek(file.size);
		}

		return {
			write: async (chunk) => {
				if (!chunk) return;
				OPFSLogger('writing', formatBytes(chunk.byteLength), 'bytes to', path);
				await writable.write(chunk as any);
			},

			close: async () => {
				OPFSLogger('closing');
				console.trace('closing');
				await writable.close();
				OPFSLogger('closed');
			}
		};
	}
	async append(path: string, data: BufferSource | Blob | string | ReadableStream) {
		return this.write(path, data, {
			create: true,
			append: true
		});
	}

	async readBuffer(path: string): Promise<ArrayBuffer> {
		const handle = await this.fileHandle(path);
		const file = await handle.getFile();
		OPFSLogger('reading buffer', path);

		return file.arrayBuffer();
	}

	async readText(path: string): Promise<string> {
		const handle = await this.fileHandle(path);
		const file = await handle.getFile();
		OPFSLogger('reading text', path);

		return file.text();
	}

	async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
		const handle = await this.fileHandle(path);
		const file = await handle.getFile();
		OPFSLogger('reading stream', path);

		const stream = file.stream();

		if (!stream) {
			throw new Error('Streaming not supported');
		}

		return stream as ReadableStream<Uint8Array>;
	}

	async copy(from: string, to: string) {
		OPFSLogger('copying', from, to);

		const source = await this.fileHandle(from);
		const file = await source.getFile();

		await this.write(to, file, {
			create: true
		});
	}

	async move(from: string, to: string) {
		OPFSLogger('moving', from, to);

		await this.copy(from, to);
		await this.delete(from);
	}
	async directoryHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
		const { parent, name } = await this.resolvePath(path, create);
		return parent.getDirectoryHandle(name, { create });
	}

	async listDirectory(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
		const handle = await this.directoryHandle(path);
		const entries: Array<{ name: string; isDirectory: boolean }> = [];
		for await (const entry of handle.values()) {
			entries.push({ name: entry.name, isDirectory: entry.kind === 'directory' });
		}
		return entries;
	}

	async existsDirectory(path: string): Promise<boolean> {
		try {
			await this.directoryHandle(path);
			return true;
		} catch {
			return false;
		}
	}
	private async _copyDir(
		from: FileSystemDirectoryHandle,
		to: FileSystemDirectoryHandle
	): Promise<void> {
		for await (const [name, entry] of from.entries()) {
			if (entry.kind === 'directory') {
				const toChild = await to.getDirectoryHandle(name, { create: true });
				await this._copyDir(entry as FileSystemDirectoryHandle, toChild);
			} else {
				const file = await (entry as FileSystemFileHandle).getFile();
				const toFile = await to.getFileHandle(name, { create: true });
				const writable = await toFile.createWritable();
				await file.stream().pipeTo(writable);
			}
		}
	}

	async copyDirectory(from: string, to: string): Promise<void> {
		OPFSLogger('copying directory', from, 'to', to);
		const fromHandle = await this.directoryHandle(from);
		const toHandle = await this.directoryHandle(to, true);
		await this._copyDir(fromHandle, toHandle);
	}

	async moveDirectory(from: string, to: string): Promise<void> {
		OPFSLogger('moving directory', from, 'tp', to);
		await this.copyDirectory(from, to);
		await this.delete(from);
	}
}

export const OPFS = ifBrowser(() => new OPFSClass());
