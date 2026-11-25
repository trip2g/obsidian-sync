/**
 * An in-memory vault for tests whose every write moves the file's mtime, as a
 * disk does, so a sync that trusts unchanged mtimes sees each edit.
 */
export class FakeDisk extends Map<string, string> {
	readonly mtimes = new Map<string, number>();
	private tick = 0;

	static of(entries: Record<string, string> | Array<[string, string]> = {}): FakeDisk {
		const disk = new FakeDisk();
		for (const [path, content] of Array.isArray(entries) ? entries : Object.entries(entries)) {
			disk.set(path, content);
		}
		return disk;
	}

	set(path: string, content: string): this {
		super.set(path, content);
		this.mtimes?.set(path, ++this.tick);
		return this;
	}

	localFiles(): Array<{ path: string; mtime: number; size: number }> {
		return [...this.entries()].map(([path, content]) => ({
			path,
			mtime: this.mtimes.get(path) ?? 0,
			size: content.length,
		}));
	}
}
