import { describe, it, expect, vi } from "vitest";
import { classifyFile, classifySync } from "./classify";
import type { ClassifyEnv, LocalFile, ServerHash, SyncState } from "./types";

describe("classifyFile", () => {
	// Test 1: Both hashes match -> unchanged
	it("returns unchanged when local and remote hashes match", () => {
		expect(classifyFile("abc123", "abc123", null)).toBe("unchanged");
		expect(classifyFile("abc123", "abc123", "abc123")).toBe("unchanged");
		expect(classifyFile("abc123", "abc123", "different")).toBe("unchanged");
	});

	// Test 2: Local only, never synced -> local_only
	it("returns local_only when file exists only locally and was never synced", () => {
		expect(classifyFile("abc123", null, null)).toBe("local_only");
	});

	// Test 3: Local only, was synced -> server_deleted
	it("returns server_deleted when file was synced but deleted on server", () => {
		expect(classifyFile("abc123", null, "abc123")).toBe("server_deleted");
		expect(classifyFile("abc123", null, "old_hash")).toBe("server_deleted");
	});

	// Test 4: Remote only, never synced -> remote_only
	it("returns remote_only when file exists only on server and was never synced", () => {
		expect(classifyFile(null, "abc123", null)).toBe("remote_only");
	});

	// Test 5: Remote only, was synced -> local_deleted
	it("returns local_deleted when file was synced but deleted locally", () => {
		expect(classifyFile(null, "abc123", "abc123")).toBe("local_deleted");
		expect(classifyFile(null, "abc123", "old_hash")).toBe("local_deleted");
	});

	// Test 6: Local changed, remote unchanged -> push
	it("returns push when local changed but remote matches last sync", () => {
		expect(classifyFile("new_hash", "old_hash", "old_hash")).toBe("push");
	});

	// Test 7: Local unchanged, remote changed -> pull
	it("returns pull when remote changed but local matches last sync", () => {
		expect(classifyFile("old_hash", "new_hash", "old_hash")).toBe("pull");
	});

	// Test 8: Both changed (different from lastSynced) -> conflict
	it("returns conflict when both local and remote changed", () => {
		expect(classifyFile("local_new", "remote_new", "base_hash")).toBe("conflict");
	});

	// Test 9: Both exist but never synced -> conflict
	it("returns conflict when both exist but file was never synced", () => {
		expect(classifyFile("local_hash", "remote_hash", null)).toBe("conflict");
	});

	// Test 10: Both null -> unchanged (edge case)
	// This test specifically checks that the early return for both-null case works
	it("returns unchanged when both local and remote are null", () => {
		const result1 = classifyFile(null, null, null);
		const result2 = classifyFile(null, null, "some_hash");

		// Must return "unchanged" string, not undefined or any other value
		expect(result1).toStrictEqual("unchanged");
		expect(result2).toStrictEqual("unchanged");

		// Double-check it's a valid SyncAction string
		expect(["unchanged", "push", "pull", "conflict", "local_only", "remote_only", "local_deleted", "server_deleted"]).toContain(result1);
	});

	// Test 11: Verify mutual exclusivity of conditions
	it("correctly distinguishes between local-only and server-deleted based on lastSyncedHash", () => {
		// Never synced -> local_only
		const neverSynced = classifyFile("hash", null, null);
		expect(neverSynced).toBe("local_only");
		expect(neverSynced).not.toBe("server_deleted");

		// Was synced -> server_deleted
		const wasSynced = classifyFile("hash", null, "old_hash");
		expect(wasSynced).toBe("server_deleted");
		expect(wasSynced).not.toBe("local_only");
	});

	// Test 12: Verify mutual exclusivity for remote-only vs local-deleted
	it("correctly distinguishes between remote-only and local-deleted based on lastSyncedHash", () => {
		// Never synced -> remote_only
		const neverSynced = classifyFile(null, "hash", null);
		expect(neverSynced).toBe("remote_only");
		expect(neverSynced).not.toBe("local_deleted");

		// Was synced -> local_deleted
		const wasSynced = classifyFile(null, "hash", "old_hash");
		expect(wasSynced).toBe("local_deleted");
		expect(wasSynced).not.toBe("remote_only");
	});

	// Test 13: Verify conflict detection requires lastSyncedHash to be null
	it("returns conflict only when both exist and never synced", () => {
		// Both exist, never synced -> conflict
		const conflict = classifyFile("local", "remote", null);
		expect(conflict).toBe("conflict");

		// Both exist, was synced, both changed -> also conflict but different path
		const bothChanged = classifyFile("new_local", "new_remote", "base");
		expect(bothChanged).toBe("conflict");

		// Both exist, was synced, only one changed -> not conflict
		const onlyLocalChanged = classifyFile("new_local", "base", "base");
		expect(onlyLocalChanged).toBe("push");
		expect(onlyLocalChanged).not.toBe("conflict");
	});
});

describe("classifySync", () => {
	// Helper to create mock env
	function createMockEnv(
		localFiles: Array<{ path: string; mtime: number; content: string }>,
		serverHashes: ServerHash[],
		syncState: SyncState = { files: {} }
	): ClassifyEnv {
		const contentMap = new Map(localFiles.map((f) => [f.path, f.content]));

		return {
			getLocalFiles: vi.fn().mockResolvedValue(
				localFiles.map((f) => ({ path: f.path, mtime: f.mtime }))
			),
			getServerHashes: vi.fn().mockResolvedValue(serverHashes),
			getSyncState: vi.fn().mockReturnValue(syncState),
			computeHash: vi.fn().mockImplementation(async (content: string) => `hash:${content}`),
			readFileContent: vi.fn().mockImplementation(async (path: string) => contentMap.get(path) || ""),
		};
	}

	it("classifies unchanged files correctly", async () => {
		const env = createMockEnv(
			[{ path: "note.md", mtime: 1000, content: "hello" }],
			[{ path: "note.md", hash: "hash:hello" }],
			{ files: { "note.md": "hash:hello" } }
		);

		const plan = await classifySync(env);

		expect(plan.unchanged).toBe(1);
		expect(plan.pulls).toHaveLength(0);
		expect(plan.pushes).toHaveLength(0);
	});

	it("classifies local-only files correctly", async () => {
		const env = createMockEnv(
			[{ path: "new.md", mtime: 1000, content: "new content" }],
			[],
			{ files: {} }
		);

		const plan = await classifySync(env);

		expect(plan.localOnly).toHaveLength(1);
		expect(plan.localOnly[0].path).toBe("new.md");
	});

	it("classifies remote-only files correctly", async () => {
		const env = createMockEnv(
			[],
			[{ path: "server.md", hash: "server_hash" }],
			{ files: {} }
		);

		const plan = await classifySync(env);

		expect(plan.remoteOnly).toHaveLength(1);
		expect(plan.remoteOnly[0].path).toBe("server.md");
	});

	it("classifies push when local changed", async () => {
		const env = createMockEnv(
			[{ path: "note.md", mtime: 1000, content: "updated" }],
			[{ path: "note.md", hash: "old_hash" }],
			{ files: { "note.md": "old_hash" } }
		);

		const plan = await classifySync(env);

		expect(plan.pushes).toHaveLength(1);
		expect(plan.pushes[0].path).toBe("note.md");
	});

	it("classifies pull when remote changed", async () => {
		const env = createMockEnv(
			[{ path: "note.md", mtime: 1000, content: "old" }],
			[{ path: "note.md", hash: "new_server_hash" }],
			{ files: { "note.md": "hash:old" } }
		);

		const plan = await classifySync(env);

		expect(plan.pulls).toHaveLength(1);
		expect(plan.pulls[0].path).toBe("note.md");
	});

	it("classifies conflict when both changed", async () => {
		const env = createMockEnv(
			[{ path: "note.md", mtime: 1000, content: "local_change" }],
			[{ path: "note.md", hash: "remote_change" }],
			{ files: { "note.md": "base_hash" } }
		);

		const plan = await classifySync(env);

		expect(plan.conflicts).toHaveLength(1);
		expect(plan.conflicts[0].path).toBe("note.md");
	});

	it("uses cached hash when mtime unchanged", async () => {
		const env = createMockEnv(
			[{ path: "note.md", mtime: 1000, content: "content" }],
			[{ path: "note.md", hash: "cached_hash" }],
			{
				files: { "note.md": "cached_hash" },
				mtimes: { "note.md": 1000 },
				localHashes: { "note.md": "cached_hash" },
			}
		);

		const plan = await classifySync(env);

		expect(plan.unchanged).toBe(1);
		// readFileContent should not be called because hash was cached
		expect(env.readFileContent).not.toHaveBeenCalled();
	});

	it("recomputes hash when mtime changed", async () => {
		const env = createMockEnv(
			[{ path: "note.md", mtime: 2000, content: "new content" }],
			[{ path: "note.md", hash: "old_hash" }],
			{
				files: { "note.md": "old_hash" },
				mtimes: { "note.md": 1000 }, // Different mtime
				localHashes: { "note.md": "old_hash" },
			}
		);

		const plan = await classifySync(env);

		// Should recompute because mtime differs
		expect(env.readFileContent).toHaveBeenCalledWith("note.md");
		expect(plan.pushes).toHaveLength(1);
	});

	it("handles multiple files with different actions", async () => {
		const env = createMockEnv(
			[
				{ path: "unchanged.md", mtime: 1000, content: "same" },
				{ path: "local_new.md", mtime: 1000, content: "new" },
				{ path: "to_push.md", mtime: 1000, content: "updated" },
			],
			[
				{ path: "unchanged.md", hash: "hash:same" },
				{ path: "remote_new.md", hash: "remote_hash" },
				{ path: "to_push.md", hash: "old_hash" },
			],
			{
				files: {
					"unchanged.md": "hash:same",
					"to_push.md": "old_hash",
				},
			}
		);

		const plan = await classifySync(env);

		expect(plan.unchanged).toBe(1);
		expect(plan.localOnly).toHaveLength(1);
		expect(plan.remoteOnly).toHaveLength(1);
		expect(plan.pushes).toHaveLength(1);
		// Verify classifications array contains all files
		expect(plan.classifications).toHaveLength(4);
	});

	it("classifies local_deleted when file was synced but deleted locally", async () => {
		const env = createMockEnv(
			[], // No local files
			[{ path: "deleted.md", hash: "server_hash" }],
			{ files: { "deleted.md": "old_synced_hash" } } // Was synced before
		);

		const plan = await classifySync(env);

		expect(plan.localDeleted).toHaveLength(1);
		expect(plan.localDeleted[0].path).toBe("deleted.md");
		expect(plan.localDeleted[0].action).toBe("local_deleted");
		expect(plan.localDeleted[0].localHash).toBeNull();
		expect(plan.localDeleted[0].remoteHash).toBe("server_hash");
		// Verify it's in classifications too
		expect(plan.classifications.some((c) => c.path === "deleted.md" && c.action === "local_deleted")).toBe(true);
	});

	it("classifies server_deleted when file was synced but deleted on server", async () => {
		const env = createMockEnv(
			[{ path: "local.md", mtime: 1000, content: "still here" }],
			[], // No server files
			{ files: { "local.md": "old_synced_hash" } } // Was synced before
		);

		const plan = await classifySync(env);

		expect(plan.serverDeleted).toHaveLength(1);
		expect(plan.serverDeleted[0].path).toBe("local.md");
		expect(plan.serverDeleted[0].action).toBe("server_deleted");
		expect(plan.serverDeleted[0].localHash).toBe("hash:still here");
		expect(plan.serverDeleted[0].remoteHash).toBeNull();
		// Verify it's in classifications too
		expect(plan.classifications.some((c) => c.path === "local.md" && c.action === "server_deleted")).toBe(true);
	});

	it("correctly populates classifications array with all file actions", async () => {
		const env = createMockEnv(
			[
				{ path: "unchanged.md", mtime: 1000, content: "same" },
				{ path: "push.md", mtime: 1000, content: "changed" },
				{ path: "local_only.md", mtime: 1000, content: "new" },
				{ path: "server_deleted.md", mtime: 1000, content: "orphan" },
				{ path: "pull.md", mtime: 1000, content: "old_content" }, // Local file exists for pull
			],
			[
				{ path: "unchanged.md", hash: "hash:same" },
				{ path: "push.md", hash: "old_hash" },
				{ path: "pull.md", hash: "new_remote_hash" }, // Remote changed
				{ path: "remote_only.md", hash: "brand_new" },
				{ path: "local_deleted.md", hash: "still_on_server" },
			],
			{
				files: {
					"unchanged.md": "hash:same",
					"push.md": "old_hash",
					"pull.md": "hash:old_content", // lastSynced = local hash -> pull
					"server_deleted.md": "was_synced",
					"local_deleted.md": "was_synced",
				},
			}
		);

		const plan = await classifySync(env);

		// Verify all categories are populated
		expect(plan.unchanged).toBe(1);
		expect(plan.pushes).toHaveLength(1);
		expect(plan.pulls).toHaveLength(1);
		expect(plan.localOnly).toHaveLength(1);
		expect(plan.remoteOnly).toHaveLength(1);
		expect(plan.localDeleted).toHaveLength(1);
		expect(plan.serverDeleted).toHaveLength(1);

		// Verify classifications contains exactly the sum of all categories
		const totalCategorized =
			plan.unchanged +
			plan.pushes.length +
			plan.pulls.length +
			plan.conflicts.length +
			plan.localOnly.length +
			plan.remoteOnly.length +
			plan.localDeleted.length +
			plan.serverDeleted.length;
		expect(plan.classifications).toHaveLength(totalCategorized);

		// Verify each classification has required fields
		for (const c of plan.classifications) {
			expect(c.path).toBeDefined();
			expect(c.action).toBeDefined();
			expect(["unchanged", "push", "pull", "conflict", "local_only", "remote_only", "local_deleted", "server_deleted"]).toContain(c.action);
		}
	});

	it("uses localFileMap to lookup files by path for mtime caching", async () => {
		// This test ensures localFileMap is actually used
		const env = createMockEnv(
			[
				{ path: "file1.md", mtime: 1000, content: "content1" },
				{ path: "file2.md", mtime: 2000, content: "content2" },
			],
			[
				{ path: "file1.md", hash: "hash:content1" },
				{ path: "file2.md", hash: "old_hash" },
			],
			{
				files: {
					"file1.md": "hash:content1",
					"file2.md": "old_hash",
				},
				mtimes: {
					"file1.md": 1000, // Same mtime -> use cache
					"file2.md": 1000, // Different mtime -> recompute
				},
				localHashes: {
					"file1.md": "hash:content1",
					"file2.md": "old_hash",
				},
			}
		);

		const plan = await classifySync(env);

		// file1 should use cache (mtime matches)
		// file2 should recompute (mtime differs)
		expect(env.readFileContent).toHaveBeenCalledWith("file2.md");
		expect(env.readFileContent).not.toHaveBeenCalledWith("file1.md");

		// file1 unchanged, file2 push (content changed)
		expect(plan.unchanged).toBe(1);
		expect(plan.pushes).toHaveLength(1);
		expect(plan.pushes[0].path).toBe("file2.md");
	});
});
