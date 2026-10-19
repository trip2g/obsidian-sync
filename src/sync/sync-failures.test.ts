import { describe, it, expect } from "vitest";
import { classifySync } from "./classify";
import { filterPlan } from "./filter";
import { executePlan } from "./execute";
import type { SyncEnv, SyncState, SyncResult, NoteUpdate, PushedNote, ConflictInfo, ConflictResolution } from "./types";

const h = (c: string) => `hash:${c}`;

type PushFailure = "throw" | "empty";

/**
 * A vault and a server that answer like trip2g: a successful pushNotes lists
 * every server note, not just the pushed ones, and a whole batch is either
 * written or rejected.
 */
class World {
	disk = new Map<string, string>();
	server = new Map<string, string>();
	state: SyncState = { files: {} };
	resolution: ConflictResolution = "keep_local";
	failPush: (batch: NoteUpdate[]) => boolean = () => false;
	pushFailure: PushFailure = "throw";
	failHide = false;
	batchSize = 100;

	env(): SyncEnv {
		return {
			pushBatchSize: this.batchSize,
			getLocalFiles: async () => [...this.disk.keys()].map((path) => ({ path, mtime: 1 })),
			getServerHashes: async () => [...this.server].map(([path, c]) => ({ path, hash: h(c) })),
			getSyncState: () => this.state,
			computeHash: async (c: string) => h(c),
			readFileContent: async (p: string) => {
				const c = this.disk.get(p);
				if (c === undefined) throw new Error(`missing ${p}`);
				return c;
			},
			writeFile: async (p: string, c: string) => {
				this.disk.set(p, c);
			},
			writeBinaryFile: async () => {},
			readBinaryFile: async () => new ArrayBuffer(0),
			deleteFile: async (p: string) => {
				this.disk.delete(p);
			},
			createFolder: async () => {},
			fileExists: async (p: string) => this.disk.has(p),
			pushNotes: async (updates: NoteUpdate[]): Promise<PushedNote[]> => {
				if (this.failPush(updates)) {
					if (this.pushFailure === "throw") {
						throw new Error("Push failed: File content must be UTF-8 text");
					}
					return [];
				}
				for (const u of updates) this.server.set(u.path, u.content);
				return [...this.server.keys()].map((p) => ({ id: p, path: p, assets: [] }));
			},
			hideNotes: async (paths: string[]) => {
				if (this.failHide) throw new Error("Hide failed: timeout");
				for (const p of paths) this.server.delete(p);
			},
			fetchNoteContents: async (paths: string[]) =>
				paths.filter((p) => this.server.has(p)).map((p) => ({ path: p, content: this.server.get(p) as string })),
			fetchNoteAssets: async () => [],
			uploadAsset: async () => true,
			downloadAsset: async () => null,
			commitNotes: async () => ({ updated: [] }),
			computeBinaryHash: async () => "",
			resolveAssetPath: async () => null,
			saveSyncState: async (s: SyncState) => {
				this.state = JSON.parse(JSON.stringify(s)) as SyncState;
			},
			onProgress: () => {},
			onConflict: async (cs: ConflictInfo[]) => cs.map(() => this.resolution),
			onAssetConflict: async () => [],
			onServerDeleted: async () => false,
			confirmPush: async () => true,
		};
	}

	async sync(): Promise<SyncResult> {
		const env = this.env();
		const plan = await classifySync(env);
		return executePlan(env, filterPlan(plan, { twoWaySync: true }), { twoWaySync: true });
	}

	async baseline(path: string, content: string): Promise<void> {
		this.disk.set(path, content);
		this.server.set(path, content);
		await this.sync();
	}
}

describe("a push batch that fails", () => {
	for (const failure of ["throw", "empty"] as const) {
		it(`records none of its notes, even when another batch's response lists them (failure: ${failure})`, async () => {
			const w = new World();
			w.batchSize = 1;
			w.pushFailure = failure;
			await w.baseline("a.md", "a0");
			await w.baseline("b.md", "b0");
			w.disk.set("a.md", "a1 local");
			w.disk.set("b.md", "b1 local");
			w.failPush = (batch) => batch.some((u) => u.path === "a.md");

			await w.sync();

			expect(w.server.get("a.md")).toBe("a0");
			expect(w.state.files["a.md"]).toBe(h("a0"));
			expect(w.server.get("b.md")).toBe("b1 local");
			expect(w.state.files["b.md"]).toBe(h("b1 local"));

			w.failPush = () => false;
			await w.sync();

			expect(w.disk.get("a.md")).toBe("a1 local");
			expect(w.server.get("a.md")).toBe("a1 local");
		});
	}

	it("is reported in the result", async () => {
		const w = new World();
		await w.baseline("a.md", "a0");
		w.disk.set("a.md", "a1 local");
		w.failPush = () => true;

		const result = await w.sync();

		expect(result.pushed).toBe(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("a.md");
		expect(result.errors[0]).toContain("UTF-8");
	});
});

describe("a conflict resolved with keep_local whose push fails", () => {
	for (const failure of ["throw", "empty"] as const) {
		it(`is not recorded as resolved, so the local edit survives the next sync (failure: ${failure})`, async () => {
			const w = new World();
			w.pushFailure = failure;
			await w.baseline("n.md", "base");
			w.disk.set("n.md", "local edit");
			w.server.set("n.md", "server edit");
			w.failPush = () => true;

			const result = await w.sync();

			expect(result.conflictsResolved).toBe(0);
			expect(result.errors.some((e) => e.includes("n.md"))).toBe(true);
			expect(w.state.files["n.md"]).toBe(h("base"));

			w.failPush = () => false;
			await w.sync();

			expect(w.disk.get("n.md")).toBe("local edit");
			expect(w.server.get("n.md")).toBe("local edit");
		});
	}
});

describe("a conflict resolved with keep_both", () => {
	it("keeps both versions on disk and on the server across later syncs", async () => {
		const w = new World();
		await w.baseline("n.md", "base");
		w.disk.set("n.md", "local edit");
		w.server.set("n.md", "server edit");
		w.resolution = "keep_both";

		await w.sync();
		await w.sync();
		await w.sync();

		expect(w.disk.get("n.md")).toBe("local edit");
		expect(w.disk.get("n (server).md")).toBe("server edit");
		expect(w.server.get("n.md")).toBe("local edit");
		expect(w.server.get("n (server).md")).toBe("server edit");
	});

	it("never overwrites an existing server copy, on disk or on the server", async () => {
		const w = new World();
		await w.baseline("n.md", "base");
		await w.baseline("n (server).md", "an older server copy");
		w.server.set("n (server 2).md", "a copy only the server has");
		w.disk.set("n.md", "local edit");
		w.server.set("n.md", "server edit");
		w.resolution = "keep_both";

		await w.sync();
		await w.sync();

		expect(w.disk.get("n (server).md")).toBe("an older server copy");
		expect(w.server.get("n (server).md")).toBe("an older server copy");
		expect(w.disk.get("n (server 2).md")).toBe("a copy only the server has");
		expect(w.server.get("n (server 2).md")).toBe("a copy only the server has");
		expect(w.disk.get("n (server 3).md")).toBe("server edit");
		expect(w.server.get("n (server 3).md")).toBe("server edit");
		expect(w.disk.get("n.md")).toBe("local edit");
		expect(w.server.get("n.md")).toBe("local edit");
	});

	for (const [path, copy] of [
		["notes.v2/n", "notes.v2/n (server)"],
		["notes.v2/n.md", "notes.v2/n (server).md"],
		["notes/.n", "notes/.n (server)"],
	] as const) {
		it(`names the copy of ${path} ${copy}`, async () => {
			const w = new World();
			await w.baseline(path, "base");
			w.disk.set(path, "local edit");
			w.server.set(path, "server edit");
			w.resolution = "keep_both";

			await w.sync();

			expect(w.disk.get(copy)).toBe("server edit");
			expect(w.server.get(copy)).toBe("server edit");
			expect(w.disk.get(path)).toBe("local edit");
		});
	}

	it("records nothing when the push fails, so the local edit is not pulled over", async () => {
		const w = new World();
		await w.baseline("n.md", "base");
		w.disk.set("n.md", "local edit");
		w.server.set("n.md", "server edit");
		w.resolution = "keep_both";
		w.failPush = () => true;

		const result = await w.sync();

		expect(result.errors.some((e) => e.includes("n.md"))).toBe(true);
		expect(w.state.files["n.md"]).toBe(h("base"));

		w.failPush = () => false;
		await w.sync();

		expect(w.disk.get("n.md")).toBe("local edit");
		expect(w.server.get("n.md")).toBe("local edit");
		expect(w.server.get("n (server).md")).toBe("server edit");
	});
});

describe("a local delete whose hide fails", () => {
	it("keeps the sync record and reports the error, so the note is hidden next time instead of downloaded back", async () => {
		const w = new World();
		await w.baseline("n.md", "base");
		w.disk.delete("n.md");
		w.failHide = true;

		const result = await w.sync();

		expect(w.state.files["n.md"]).toBe(h("base"));
		expect(result.errors.some((e) => e.includes("n.md") && e.includes("timeout"))).toBe(true);

		w.failHide = false;
		await w.sync();

		expect(w.disk.has("n.md")).toBe(false);
		expect(w.server.has("n.md")).toBe(false);
		expect(w.state.files["n.md"]).toBe(undefined);
	});
});
