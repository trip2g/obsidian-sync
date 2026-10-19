import { describe, it, expect } from "vitest";
import { classifySync } from "./classify";
import { filterPlan } from "./filter";
import { executePlan } from "./execute";
import type { SyncEnv, SyncState, NoteUpdate, PushedNote, ConflictInfo, ConflictResolution } from "./types";

function makeHash(content: string): string {
	return `hash:${content}`;
}

class FakeVault {
	disk = new Map<string, string>();
	server = new Map<string, string>();
	pushed: NoteUpdate[] = [];
	conflicts: string[] = [];
	state: SyncState = { files: {} };

	env(): SyncEnv {
		return {
			pushBatchSize: 100,
			getLocalFiles: async () => [...this.disk.keys()].map((path) => ({ path, mtime: 1 })),
			getServerHashes: async () => [...this.server].map(([path, content]) => ({ path, hash: makeHash(content) })),
			getSyncState: () => this.state,
			computeHash: async (content: string) => makeHash(content),
			readFileContent: async (path: string) => {
				const content = this.disk.get(path);
				if (content === undefined) {
					throw new Error(`missing ${path}`);
				}
				return content;
			},
			writeFile: async (path: string, content: string) => {
				this.disk.set(path, content);
			},
			writeBinaryFile: async () => {},
			readBinaryFile: async () => new ArrayBuffer(0),
			deleteFile: async (path: string) => {
				this.disk.delete(path);
			},
			createFolder: async () => {},
			fileExists: async (path: string) => this.disk.has(path),
			pushNotes: async (updates: NoteUpdate[]): Promise<PushedNote[]> => {
				for (const u of updates) {
					this.pushed.push(u);
					this.server.set(u.path, u.content);
				}
				return updates.map((u) => ({ id: u.path, path: u.path, assets: [] }));
			},
			hideNotes: async () => {},
			fetchNoteContents: async (paths: string[]) =>
				paths.filter((p) => this.server.has(p)).map((p) => ({ path: p, content: this.server.get(p) as string })),
			fetchNoteAssets: async () => [],
			uploadAsset: async () => true,
			downloadAsset: async () => null,
			commitNotes: async () => ({ updated: [] }),
			computeBinaryHash: async () => "",
			resolveAssetPath: async () => null,
			saveSyncState: async (state: SyncState) => {
				this.state = JSON.parse(JSON.stringify(state)) as SyncState;
			},
			onProgress: () => {},
			onConflict: async (conflicts: ConflictInfo[]): Promise<ConflictResolution[]> => {
				this.conflicts.push(...conflicts.map((c) => c.path));
				return conflicts.map(() => "keep_local" as const);
			},
			onAssetConflict: async () => [],
			onServerDeleted: async () => false,
			confirmPush: async () => true,
		};
	}

	async sync(): Promise<void> {
		const env = this.env();
		const plan = await classifySync(env);
		const filtered = filterPlan(plan, { twoWaySync: true });
		await executePlan(env, filtered, { twoWaySync: true });
	}
}

describe("a note identical on both sides when the sync state was created", () => {
	it("gets its hash recorded in the sync state", async () => {
		const vault = new FakeVault();
		vault.disk.set("note.md", "v1");
		vault.server.set("note.md", "v1");

		await vault.sync();

		expect(vault.state.files["note.md"]).toBe(makeHash("v1"));
	});

	it("pulls a later server edit instead of pushing the stale local copy over it", async () => {
		const vault = new FakeVault();
		vault.disk.set("note.md", "v1");
		vault.server.set("note.md", "v1");

		await vault.sync();
		vault.server.set("note.md", "v2 edited on the server");
		await vault.sync();

		expect(vault.disk.get("note.md")).toBe("v2 edited on the server");
		expect(vault.server.get("note.md")).toBe("v2 edited on the server");
		expect(vault.pushed).toEqual([]);
		expect(vault.conflicts).toEqual([]);
		expect(vault.state.files["note.md"]).toBe(makeHash("v2 edited on the server"));
	});
});
