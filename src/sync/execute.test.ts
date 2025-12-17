/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from "vitest";
import { executePlan } from "./execute";
import type {
	SyncEnv,
	SyncPlan,
	SyncState,
	FileClassification,
	ConflictResolution,
	AssetConflictResolution,
	NoteContent,
	PushedNote,
} from "./types";

// Helper to create empty plan
function emptyPlan(): SyncPlan {
	return {
		classifications: [],
		pulls: [],
		pushes: [],
		conflicts: [],
		localOnly: [],
		remoteOnly: [],
		localDeleted: [],
		serverDeleted: [],
		unchanged: 0,
	};
}

// Helper to create a classification
function makeClassification(
	path: string,
	action: FileClassification["action"],
	localHash: string | null = "local_hash",
	remoteHash: string | null = "remote_hash"
): FileClassification {
	return { path, action, localHash, remoteHash, lastSyncedHash: "synced_hash" };
}

// Helper to create mock SyncEnv
function createMockEnv(options: {
	syncState?: SyncState;
	fileContents?: Record<string, string>;
	binaryContents?: Record<string, ArrayBuffer>;
	serverContents?: Record<string, string>;
	confirmPush?: boolean;
	onServerDeleted?: boolean;
	conflictResolutions?: ConflictResolution[];
	assetConflictResolutions?: AssetConflictResolution[];
	pushBatchSize?: number;
}): SyncEnv {
	const {
		syncState = { files: {} },
		fileContents = {},
		binaryContents = {},
		serverContents = {},
		confirmPush = true,
		onServerDeleted = false,
		conflictResolutions = [],
		assetConflictResolutions = [],
		pushBatchSize = 100,
	} = options;

	let resolutionIndex = 0;

	return {
		// Configuration
		pushBatchSize,

		// ClassifyEnv methods
		getLocalFiles: vi.fn().mockResolvedValue([]),
		getServerHashes: vi.fn().mockResolvedValue([]),
		getSyncState: vi.fn().mockReturnValue(syncState),
		computeHash: vi.fn().mockImplementation(async (content: string) => `hash:${content}`),
		readFileContent: vi.fn().mockImplementation(async (path: string) => {
			if (fileContents[path] !== undefined) {
				return fileContents[path];
			}
			throw new Error(`File not found: ${path}`);
		}),

		// File operations
		writeFile: vi.fn().mockResolvedValue(undefined),
		writeBinaryFile: vi.fn().mockResolvedValue(undefined),
		readBinaryFile: vi.fn().mockImplementation(async (path: string) => {
			if (binaryContents[path] !== undefined) {
				return binaryContents[path];
			}
			return new ArrayBuffer(0);
		}),
		deleteFile: vi.fn().mockResolvedValue(undefined),
		createFolder: vi.fn().mockResolvedValue(undefined),
		fileExists: vi.fn().mockImplementation(async (path: string) => {
			return fileContents[path] !== undefined || binaryContents[path] !== undefined;
		}),

		// Server operations
		pushNotes: vi.fn().mockImplementation(async (updates) => {
			return updates.map((u: { path: string }) => ({
				id: `id_${u.path}`,
				path: u.path,
				assets: [],
			})) as PushedNote[];
		}),
		hideNotes: vi.fn().mockResolvedValue(undefined),
		fetchNoteContents: vi.fn().mockImplementation(async (paths: string[]) => {
			return paths
				.filter((p) => serverContents[p] !== undefined)
				.map((p) => ({ path: p, content: serverContents[p] })) as NoteContent[];
		}),
		fetchNoteAssets: vi.fn().mockResolvedValue([]),
		uploadAsset: vi.fn().mockResolvedValue(true),
		downloadAsset: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
		commitNotes: vi.fn().mockResolvedValue(undefined),

		// Asset operations
		computeBinaryHash: vi.fn().mockImplementation(async () => "binary_hash"),
		resolveAssetPath: vi.fn().mockImplementation(async (assetPath: string) => assetPath),

		// State
		saveSyncState: vi.fn().mockResolvedValue(undefined),

		// UI callbacks
		onProgress: vi.fn(),
		onConflict: vi.fn().mockImplementation(async () => {
			return conflictResolutions.slice(resolutionIndex, resolutionIndex + 100);
		}),
		onAssetConflict: vi.fn().mockImplementation(async () => {
			return assetConflictResolutions;
		}),
		onServerDeleted: vi.fn().mockResolvedValue(onServerDeleted),
		confirmPush: vi.fn().mockResolvedValue(confirmPush),
	};
}

describe("executePlan", () => {
	describe("empty plan", () => {
		it("does nothing for empty plan", async () => {
			const env = createMockEnv({});
			const plan = emptyPlan();

			const result = await executePlan(env, plan);

			expect(result.pulled).toBe(0);
			expect(result.pushed).toBe(0);
			expect(result.conflictsResolved).toBe(0);
			expect(result.errors).toHaveLength(0);
			expect(env.saveSyncState).toHaveBeenCalled();
		});
	});

	describe("pulls", () => {
		it("pulls files from server", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				serverContents: { "note.md": "server content" },
			});
			const plan = emptyPlan();
			plan.pulls = [makeClassification("note.md", "pull")];

			const result = await executePlan(env, plan);

			expect(result.pulled).toBe(1);
			expect(env.fetchNoteContents).toHaveBeenCalledWith(["note.md"]);
			expect(env.writeFile).toHaveBeenCalledWith("note.md", "server content");
			expect(syncState.files["note.md"]).toBe("hash:server content");
		});

		it("pulls remote_only files", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				serverContents: { "new.md": "new content" },
			});
			const plan = emptyPlan();
			plan.remoteOnly = [makeClassification("new.md", "remote_only", null, "remote_hash")];

			const result = await executePlan(env, plan);

			expect(result.pulled).toBe(1);
			expect(env.writeFile).toHaveBeenCalledWith("new.md", "new content");
		});

		it("creates directories for nested paths", async () => {
			const env = createMockEnv({
				serverContents: { "folder/subfolder/note.md": "content" },
			});
			const plan = emptyPlan();
			plan.pulls = [makeClassification("folder/subfolder/note.md", "pull")];

			await executePlan(env, plan);

			expect(env.createFolder).toHaveBeenCalledWith("folder/subfolder");
		});

		it("handles fetch errors gracefully", async () => {
			const env = createMockEnv({
				serverContents: {}, // Empty - file won't be found
			});
			const plan = emptyPlan();
			plan.pulls = [makeClassification("missing.md", "pull")];

			const result = await executePlan(env, plan);

			expect(result.pulled).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain("missing.md");
		});
	});

	describe("pushes", () => {
		it("pushes files to server", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "note.md": "local content" },
			});
			const plan = emptyPlan();
			plan.pushes = [makeClassification("note.md", "push")];

			const result = await executePlan(env, plan);

			expect(result.pushed).toBe(1);
			expect(env.pushNotes).toHaveBeenCalledWith(
				[{ path: "note.md", content: "local content" }],
				true
			);
			expect(env.commitNotes).toHaveBeenCalled();
			expect(syncState.files["note.md"]).toBe("hash:local content");
		});

		it("pushes local_only files", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "new.md": "new file" },
			});
			const plan = emptyPlan();
			plan.localOnly = [makeClassification("new.md", "local_only", "local_hash", null)];

			const result = await executePlan(env, plan);

			expect(result.pushed).toBe(1);
			expect(env.pushNotes).toHaveBeenCalled();
		});

		it("skips push when user declines confirmation", async () => {
			const env = createMockEnv({
				fileContents: { "note.md": "content" },
				confirmPush: false,
			});
			const plan = emptyPlan();
			plan.pushes = [makeClassification("note.md", "push")];

			const result = await executePlan(env, plan);

			expect(result.pushed).toBe(0);
			expect(env.pushNotes).not.toHaveBeenCalled();
			expect(env.commitNotes).not.toHaveBeenCalled();
		});

		it("handles read errors gracefully", async () => {
			const env = createMockEnv({
				fileContents: {}, // File doesn't exist
			});
			const plan = emptyPlan();
			plan.pushes = [makeClassification("missing.md", "push")];

			const result = await executePlan(env, plan);

			expect(result.pushed).toBe(0);
			expect(result.errors).toHaveLength(1);
		});

		it("batches pushNotes calls according to pushBatchSize", async () => {
			// Create 250 files
			const fileContents: Record<string, string> = {};
			const pushes: FileClassification[] = [];
			for (let i = 0; i < 250; i++) {
				const path = `note${i}.md`;
				fileContents[path] = `content ${i}`;
				pushes.push(makeClassification(path, "push"));
			}

			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents,
				pushBatchSize: 100,
			});

			const plan = emptyPlan();
			plan.pushes = pushes;

			await executePlan(env, plan);

			// Should call pushNotes 3 times: 100 + 100 + 50
			expect(env.pushNotes).toHaveBeenCalledTimes(3);

			// Verify batch sizes
			const calls = (env.pushNotes as ReturnType<typeof vi.fn>).mock.calls;
			expect(calls[0][0]).toHaveLength(100);
			expect(calls[1][0]).toHaveLength(100);
			expect(calls[2][0]).toHaveLength(50);
		});

		it("uses custom pushBatchSize", async () => {
			// Create 25 files with batch size of 10
			const fileContents: Record<string, string> = {};
			const pushes: FileClassification[] = [];
			for (let i = 0; i < 25; i++) {
				const path = `note${i}.md`;
				fileContents[path] = `content ${i}`;
				pushes.push(makeClassification(path, "push"));
			}

			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents,
				pushBatchSize: 10,
			});

			const plan = emptyPlan();
			plan.pushes = pushes;

			await executePlan(env, plan);

			// Should call pushNotes 3 times: 10 + 10 + 5
			expect(env.pushNotes).toHaveBeenCalledTimes(3);
		});

		it("handles exactly one batch size files", async () => {
			// Create exactly 100 files
			const fileContents: Record<string, string> = {};
			const pushes: FileClassification[] = [];
			for (let i = 0; i < 100; i++) {
				const path = `note${i}.md`;
				fileContents[path] = `content ${i}`;
				pushes.push(makeClassification(path, "push"));
			}

			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents,
				pushBatchSize: 100,
			});

			const plan = emptyPlan();
			plan.pushes = pushes;

			await executePlan(env, plan);

			// Should call pushNotes exactly once
			expect(env.pushNotes).toHaveBeenCalledTimes(1);
			const calls = (env.pushNotes as ReturnType<typeof vi.fn>).mock.calls;
			expect(calls[0][0]).toHaveLength(100);
		});

		it("collects all pushedNotes from batched calls", async () => {
			// Create 150 files
			const fileContents: Record<string, string> = {};
			const pushes: FileClassification[] = [];
			for (let i = 0; i < 150; i++) {
				const path = `note${i}.md`;
				fileContents[path] = `content ${i}`;
				pushes.push(makeClassification(path, "push"));
			}

			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents,
				pushBatchSize: 100,
			});

			const plan = emptyPlan();
			plan.pushes = pushes;

			const result = await executePlan(env, plan);

			// All 150 files should be pushed successfully
			expect(result.pushed).toBe(150);
			expect(Object.keys(syncState.files)).toHaveLength(150);
		});
	});

	describe("conflicts", () => {
		it("handles keep_local resolution", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "note.md": "local version" },
				serverContents: { "note.md": "server version" },
				conflictResolutions: ["keep_local"],
			});
			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			expect(result.conflictsResolved).toBe(1);
			expect(env.pushNotes).toHaveBeenCalledWith(
				[{ path: "note.md", content: "local version" }],
				true
			);
			expect(syncState.files["note.md"]).toBe("local_hash");
		});

		it("handles keep_remote resolution", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "note.md": "local version" },
				serverContents: { "note.md": "server version" },
				conflictResolutions: ["keep_remote"],
			});
			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			expect(result.conflictsResolved).toBe(1);
			expect(env.writeFile).toHaveBeenCalledWith("note.md", "server version");
			expect(syncState.files["note.md"]).toBe("remote_hash");
		});

		it("handles keep_both resolution", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "note.md": "local version" },
				serverContents: { "note.md": "server version" },
				conflictResolutions: ["keep_both"],
			});
			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			expect(result.conflictsResolved).toBe(1);
			expect(env.writeFile).toHaveBeenCalledWith("note (server).md", "server version");
			expect(syncState.files["note.md"]).toBe("local_hash");
			expect(syncState.files["note (server).md"]).toBe("hash:server version");
		});

		it("handles skip resolution", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "note.md": "local version" },
				serverContents: { "note.md": "server version" },
				conflictResolutions: ["skip"],
			});
			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			expect(result.conflictsResolved).toBe(0);
			expect(syncState.files["note.md"]).toBeUndefined();
		});

		it("skips conflicts when remote no longer exists", async () => {
			const env = createMockEnv({
				fileContents: { "note.md": "local" },
				serverContents: {}, // Remote doesn't exist
				conflictResolutions: ["keep_local"],
			});
			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			expect(result.conflictsResolved).toBe(0);
			expect(env.onConflict).not.toHaveBeenCalled();
		});
	});

	describe("server deleted", () => {
		it("deletes local files when user confirms", async () => {
			const syncState: SyncState = { files: { "deleted.md": "hash" } };
			const env = createMockEnv({
				syncState,
				onServerDeleted: true,
			});
			const plan = emptyPlan();
			plan.serverDeleted = [makeClassification("deleted.md", "server_deleted")];

			await executePlan(env, plan);

			expect(env.onServerDeleted).toHaveBeenCalledWith(["deleted.md"]);
			expect(env.deleteFile).toHaveBeenCalledWith("deleted.md");
			expect(syncState.files["deleted.md"]).toBeUndefined();
		});

		it("keeps local files when user declines", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				onServerDeleted: false,
			});
			const plan = emptyPlan();
			plan.serverDeleted = [makeClassification("kept.md", "server_deleted", "local_hash")];

			await executePlan(env, plan);

			expect(env.deleteFile).not.toHaveBeenCalled();
			expect(syncState.files["kept.md"]).toBe("local_hash");
		});
	});

	describe("local deleted", () => {
		it("hides notes on server", async () => {
			const syncState: SyncState = { files: { "deleted.md": "hash" } };
			const env = createMockEnv({ syncState });
			const plan = emptyPlan();
			plan.localDeleted = [makeClassification("deleted.md", "local_deleted", null)];

			await executePlan(env, plan);

			expect(env.hideNotes).toHaveBeenCalledWith(["deleted.md"]);
			expect(syncState.files["deleted.md"]).toBeUndefined();
		});
	});

	describe("integration", () => {
		it("handles mixed operations in correct order", async () => {
			const syncState: SyncState = { files: {} };
			const callOrder: string[] = [];

			const env = createMockEnv({
				syncState,
				fileContents: { "push.md": "push content" },
				serverContents: { "pull.md": "pull content" },
			});

			// Track call order
			(env.fetchNoteContents as ReturnType<typeof vi.fn>).mockImplementation(async (paths) => {
				callOrder.push(`fetch:${paths.join(",")}`);
				return paths.map((p: string) => ({ path: p, content: `content:${p}` }));
			});
			(env.pushNotes as ReturnType<typeof vi.fn>).mockImplementation(async (updates) => {
				callOrder.push(`push:${updates.map((u: { path: string }) => u.path).join(",")}`);
				return updates.map((u: { path: string }) => ({ id: u.path, path: u.path, assets: [] }));
			});
			(env.hideNotes as ReturnType<typeof vi.fn>).mockImplementation(async (paths) => {
				callOrder.push(`hide:${paths.join(",")}`);
			});

			const plan = emptyPlan();
			plan.pulls = [makeClassification("pull.md", "pull")];
			plan.pushes = [makeClassification("push.md", "push")];
			plan.localDeleted = [makeClassification("deleted.md", "local_deleted", null)];

			await executePlan(env, plan);

			// Verify order: pulls first, then pushes, then local deleted
			expect(callOrder[0]).toContain("fetch");
			expect(callOrder).toContainEqual(expect.stringContaining("push"));
			expect(callOrder).toContainEqual(expect.stringContaining("hide"));
		});

		it("saves sync state at the end", async () => {
			const env = createMockEnv({});
			const plan = emptyPlan();

			await executePlan(env, plan);

			expect(env.saveSyncState).toHaveBeenCalled();
		});

		it("does not commit when no pushes", async () => {
			const env = createMockEnv({
				serverContents: { "pull.md": "content" },
			});
			const plan = emptyPlan();
			plan.pulls = [makeClassification("pull.md", "pull")];

			await executePlan(env, plan);

			expect(env.commitNotes).not.toHaveBeenCalled();
		});
	});

	describe("asset downloads with twoWaySync disabled", () => {
		it("should NOT download assets for unchanged files when twoWaySync is false", async () => {
			const env = createMockEnv({});
			const plan = emptyPlan();

			// Add unchanged file with remoteHash (exists on server)
			const unchangedFile = makeClassification("note.md", "unchanged", "local_hash", "remote_hash");
			plan.classifications = [unchangedFile];
			plan.unchanged = 1;

			await executePlan(env, plan, { twoWaySync: false });

			// fetchNoteAssets should NOT be called when twoWaySync is disabled
			expect(env.fetchNoteAssets).not.toHaveBeenCalled();
			expect(env.downloadAsset).not.toHaveBeenCalled();
		});

		it("should download assets for unchanged files when twoWaySync is true", async () => {
			const env = createMockEnv({});
			// Mock fetchNoteAssets to return assets
			(env.fetchNoteAssets as ReturnType<typeof vi.fn>).mockResolvedValue([
				{
					path: "note.md",
					assets: [{ id: "img.png", url: "https://example.com/img.png", hash: "abc", absolutePath: "assets/img.png" }],
				},
			]);
			// Asset doesn't exist locally
			(env.fileExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

			const plan = emptyPlan();
			const unchangedFile = makeClassification("note.md", "unchanged", "local_hash", "remote_hash");
			plan.classifications = [unchangedFile];
			plan.unchanged = 1;

			await executePlan(env, plan, { twoWaySync: true });

			// fetchNoteAssets SHOULD be called when twoWaySync is enabled
			expect(env.fetchNoteAssets).toHaveBeenCalledWith(["note.md"]);
			expect(env.downloadAsset).toHaveBeenCalled();
		});
	});

	describe("edge cases and error handling", () => {
		it("handles write errors during pull", async () => {
			const env = createMockEnv({
				serverContents: { "note.md": "content" },
			});
			(env.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Write failed"));

			const plan = emptyPlan();
			plan.pulls = [makeClassification("note.md", "pull")];

			const result = await executePlan(env, plan);

			expect(result.pulled).toBe(0);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]).toContain("note.md");
		});

		it("does not create folder for root-level files", async () => {
			const env = createMockEnv({
				serverContents: { "note.md": "content" },
			});
			const plan = emptyPlan();
			plan.pulls = [makeClassification("note.md", "pull")];

			await executePlan(env, plan);

			// createFolder should not be called for root files (no "/" in path before filename)
			expect(env.createFolder).not.toHaveBeenCalled();
		});

		it("shows progress during pulls", async () => {
			const env = createMockEnv({
				serverContents: { "note.md": "content" },
			});
			const plan = emptyPlan();
			plan.pulls = [makeClassification("note.md", "pull")];

			await executePlan(env, plan);

			expect(env.onProgress).toHaveBeenCalledWith(expect.objectContaining({ step: "pull" }));
		});

		it("shows progress during pushes", async () => {
			const env = createMockEnv({
				fileContents: { "note.md": "content" },
			});
			const plan = emptyPlan();
			plan.pushes = [makeClassification("note.md", "push")];

			await executePlan(env, plan);

			expect(env.onProgress).toHaveBeenCalledWith(expect.objectContaining({ step: "push" }));
		});

		it("calls confirmPush with correct paths", async () => {
			const env = createMockEnv({
				fileContents: { "a.md": "a", "b.md": "b" },
			});
			const plan = emptyPlan();
			plan.pushes = [makeClassification("a.md", "push")];
			plan.localOnly = [makeClassification("b.md", "local_only", "hash", null)];

			await executePlan(env, plan);

			expect(env.confirmPush).toHaveBeenCalledWith(["a.md", "b.md"]);
		});

		it("updates syncState only for successfully pushed files", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "a.md": "a", "b.md": "b" },
			});
			// Mock pushNotes to only return one file as pushed
			(env.pushNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: "1", path: "a.md", assets: [] },
				// b.md not in response - simulates partial push
			]);

			const plan = emptyPlan();
			plan.pushes = [
				makeClassification("a.md", "push"),
				makeClassification("b.md", "push"),
			];

			await executePlan(env, plan);

			expect(syncState.files["a.md"]).toBe("hash:a");
			expect(syncState.files["b.md"]).toBeUndefined();
		});

		it("handles errors during conflict resolution", async () => {
			const env = createMockEnv({
				fileContents: { "note.md": "local" },
				serverContents: { "note.md": "remote" },
				conflictResolutions: ["keep_local"],
			});
			(env.pushNotes as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Push failed"));

			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]).toContain("note.md");
		});

		it("handles errors reading local file for conflict", async () => {
			const env = createMockEnv({
				fileContents: {}, // File doesn't exist
				serverContents: { "note.md": "remote" },
				conflictResolutions: ["keep_local"],
			});

			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			// Should have error but not crash
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it("handles missing resolution (defaults to skip)", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				fileContents: { "note.md": "local" },
				serverContents: { "note.md": "remote" },
				conflictResolutions: [], // Empty - no resolution provided
			});

			const plan = emptyPlan();
			plan.conflicts = [makeClassification("note.md", "conflict")];

			const result = await executePlan(env, plan);

			// Should default to skip
			expect(result.conflictsResolved).toBe(0);
			expect(syncState.files["note.md"]).toBeUndefined();
		});

		it("handles delete errors during server_deleted gracefully", async () => {
			const syncState: SyncState = { files: { "note.md": "hash" } };
			const env = createMockEnv({
				syncState,
				onServerDeleted: true,
			});
			(env.deleteFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Delete failed"));

			const plan = emptyPlan();
			plan.serverDeleted = [makeClassification("note.md", "server_deleted")];

			// Should not throw
			await executePlan(env, plan);

			// File may still be removed from sync state depending on implementation
		});

		it("keeps files with null localHash during server_deleted decline", async () => {
			const syncState: SyncState = { files: {} };
			const env = createMockEnv({
				syncState,
				onServerDeleted: false, // User keeps files
			});

			const plan = emptyPlan();
			plan.serverDeleted = [makeClassification("note.md", "server_deleted", null)]; // null localHash

			await executePlan(env, plan);

			// With null localHash, syncState should not be updated
			expect(syncState.files["note.md"]).toBeUndefined();
		});
	});
});
