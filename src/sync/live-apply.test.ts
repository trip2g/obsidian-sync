/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from "vitest";
import { applyLiveChanges } from "./live-apply";
import type { LiveApplyEnv } from "./live-apply";
import type { SyncState } from "./types";
import type { NoteChangeItem } from "./LivePullConnection";

// Simple hash function for tests: "hash:<content>"
function makeHash(content: string): string {
	return `hash:${content}`;
}

function makeSyncState(files: Record<string, string> = {}): SyncState {
	return { files: { ...files } };
}

function makeEnv(options: {
	localFiles?: Record<string, string>; // path -> content
	missingFiles?: string[]; // files that do NOT exist locally
	serverContents?: Record<string, string>; // returned by fetchNoteContents
} = {}): LiveApplyEnv {
	const { localFiles = {}, missingFiles = [], serverContents = {} } = options;

	return {
		fetchNoteContents: vi.fn().mockImplementation(async (paths: string[]) =>
			paths
				.filter((p) => serverContents[p] !== undefined)
				.map((p) => ({ path: p, content: serverContents[p] }))
		),
		fileExists: vi.fn().mockImplementation(async (path: string) => {
			if (missingFiles.includes(path)) return false;
			return path in localFiles;
		}),
		computeHash: vi.fn().mockImplementation(async (content: string) => makeHash(content)),
		readFileContent: vi.fn().mockImplementation(async (path: string) => {
			if (localFiles[path] === undefined) throw new Error(`File not found: ${path}`);
			return localFiles[path];
		}),
		writeFile: vi.fn().mockResolvedValue(undefined),
		createFolder: vi.fn().mockResolvedValue(undefined),
	};
}

function upsertChange(
	path: string,
	eventType: "create" | "update",
	content: string | null = null
): NoteChangeItem {
	return {
		__typename: "NoteUpsertEvent",
		path,
		eventType,
		versionId: 1,
		title: path,
		noteView: content !== null ? { path, content } : null,
	};
}

function hideChange(path: string): NoteChangeItem {
	return { __typename: "NoteHideEvent", path };
}

describe("applyLiveChanges", () => {
	describe("upsert – file written and syncState updated", () => {
		it("pulls an update when local is unchanged since last sync", async () => {
			const localContent = "old content";
			const remoteContent = "new content";
			const lastSyncedHash = makeHash(localContent);

			const env = makeEnv({ localFiles: { "note.md": localContent } });
			const syncState = makeSyncState({ "note.md": lastSyncedHash });

			const result = await applyLiveChanges(
				env,
				[upsertChange("note.md", "update", remoteContent)],
				syncState
			);

			expect(result.pulledPaths).toEqual(["note.md"]);
			expect(result.conflictCount).toBe(0);
			expect(result.hiddenPaths).toEqual([]);

			// File was written.
			expect(env.writeFile).toHaveBeenCalledWith("note.md", remoteContent);
			// syncState updated to remote hash.
			expect(syncState.files["note.md"]).toBe(makeHash(remoteContent));
		});

		it("pulls a create event when no local copy exists", async () => {
			const remoteContent = "brand new";
			const env = makeEnv({ missingFiles: ["new-note.md"] });
			const syncState = makeSyncState({});

			const result = await applyLiveChanges(
				env,
				[upsertChange("new-note.md", "create", remoteContent)],
				syncState
			);

			expect(result.pulledPaths).toEqual(["new-note.md"]);
			expect(env.writeFile).toHaveBeenCalledWith("new-note.md", remoteContent);
			expect(syncState.files["new-note.md"]).toBe(makeHash(remoteContent));
		});

		it("creates parent directories when pulling into a nested path", async () => {
			const remoteContent = "nested content";
			const env = makeEnv({ missingFiles: ["folder/sub/note.md"] });
			const syncState = makeSyncState({});

			await applyLiveChanges(
				env,
				[upsertChange("folder/sub/note.md", "create", remoteContent)],
				syncState
			);

			expect(env.createFolder).toHaveBeenCalledWith("folder/sub");
			expect(env.writeFile).toHaveBeenCalledWith("folder/sub/note.md", remoteContent);
		});

		it("fetches content when noteView is null and pulls if classified as pull", async () => {
			const localContent = "unchanged";
			const remoteContent = "server update";
			const lastSyncedHash = makeHash(localContent);

			const env = makeEnv({
				localFiles: { "note.md": localContent },
				serverContents: { "note.md": remoteContent },
			});
			const syncState = makeSyncState({ "note.md": lastSyncedHash });

			// noteView is null — must be fetched via fetchNoteContents
			const change = upsertChange("note.md", "update", null);

			const result = await applyLiveChanges(env, [change], syncState);

			expect(env.fetchNoteContents).toHaveBeenCalledWith(["note.md"]);
			expect(result.pulledPaths).toEqual(["note.md"]);
			expect(syncState.files["note.md"]).toBe(makeHash(remoteContent));
		});
	});

	describe("upsert – conflict: no write", () => {
		it("does NOT write when both local and remote changed independently", async () => {
			const originalContent = "original";
			const localContent = "local edit";
			const remoteContent = "remote edit";
			const lastSyncedHash = makeHash(originalContent);

			const env = makeEnv({ localFiles: { "note.md": localContent } });
			const syncState = makeSyncState({ "note.md": lastSyncedHash });

			const result = await applyLiveChanges(
				env,
				[upsertChange("note.md", "update", remoteContent)],
				syncState
			);

			expect(result.conflictCount).toBe(1);
			expect(result.pulledPaths).toEqual([]);
			expect(env.writeFile).not.toHaveBeenCalled();
			// syncState must remain unchanged.
			expect(syncState.files["note.md"]).toBe(lastSyncedHash);
		});

		it("does NOT write when file has never been synced (first-time conflict)", async () => {
			const env = makeEnv({ localFiles: { "note.md": "local content" } });
			const syncState = makeSyncState({}); // no lastSyncedHash

			const result = await applyLiveChanges(
				env,
				[upsertChange("note.md", "update", "remote content")],
				syncState
			);

			expect(result.conflictCount).toBe(1);
			expect(env.writeFile).not.toHaveBeenCalled();
			expect(syncState.files["note.md"]).toBeUndefined();
		});
	});

	describe("upsert – push: no write", () => {
		it("does NOT write when local changed but remote is same as lastSynced (local push)", async () => {
			const remoteContent = "original";
			const localContent = "local edit";
			const lastSyncedHash = makeHash(remoteContent);

			const env = makeEnv({ localFiles: { "note.md": localContent } });
			const syncState = makeSyncState({ "note.md": lastSyncedHash });

			const result = await applyLiveChanges(
				env,
				[upsertChange("note.md", "update", remoteContent)],
				syncState
			);

			expect(result.pulledPaths).toEqual([]);
			expect(result.conflictCount).toBe(0);
			expect(env.writeFile).not.toHaveBeenCalled();
			// syncState unchanged.
			expect(syncState.files["note.md"]).toBe(lastSyncedHash);
		});
	});

	describe("upsert – unchanged: no write", () => {
		it("skips when local and remote are identical", async () => {
			const content = "same content";
			const hash = makeHash(content);

			const env = makeEnv({ localFiles: { "note.md": content } });
			const syncState = makeSyncState({ "note.md": hash });

			const result = await applyLiveChanges(
				env,
				[upsertChange("note.md", "update", content)],
				syncState
			);

			expect(result.pulledPaths).toEqual([]);
			expect(result.conflictCount).toBe(0);
			expect(env.writeFile).not.toHaveBeenCalled();
		});
	});

	describe("hide – eligible paths returned (caller performs deletion)", () => {
		it("returns path in hiddenPaths when file exists locally and is tracked", async () => {
			const env = makeEnv({ localFiles: { "note.md": "content" } });
			const syncState = makeSyncState({ "note.md": "some-hash" });

			const result = await applyLiveChanges(env, [hideChange("note.md")], syncState);

			// applyLiveChanges does NOT delete — caller is responsible.
			expect(result.hiddenPaths).toEqual(["note.md"]);
			expect(env.writeFile).not.toHaveBeenCalled();
			// syncState is NOT mutated — deletion + state cleanup is the caller's job.
			expect(syncState.files["note.md"]).toBe("some-hash");
		});

		it("does not include path when file is not tracked in syncState", async () => {
			const env = makeEnv({ localFiles: { "note.md": "content" } });
			const syncState = makeSyncState({}); // not tracked

			const result = await applyLiveChanges(env, [hideChange("note.md")], syncState);

			expect(result.hiddenPaths).toEqual([]);
		});

		it("does not include path when file does not exist locally", async () => {
			const env = makeEnv({ missingFiles: ["note.md"] });
			const syncState = makeSyncState({ "note.md": "some-hash" });

			const result = await applyLiveChanges(env, [hideChange("note.md")], syncState);

			expect(result.hiddenPaths).toEqual([]);
		});
	});

	describe("mixed batch", () => {
		it("handles a mix of pull, conflict, and hide in one batch", async () => {
			const env = makeEnv({
				localFiles: {
					"pull-me.md": "unchanged local",
					"conflict.md": "local edit",
					"hide-me.md": "some content",
				},
			});
			const syncState = makeSyncState({
				"pull-me.md": makeHash("unchanged local"),
				"conflict.md": makeHash("original"),
				"hide-me.md": "tracked-hash",
			});

			const changes: NoteChangeItem[] = [
				upsertChange("pull-me.md", "update", "server update"),
				upsertChange("conflict.md", "update", "remote edit"),
				hideChange("hide-me.md"),
			];

			const result = await applyLiveChanges(env, changes, syncState);

			expect(result.pulledPaths).toEqual(["pull-me.md"]);
			expect(result.conflictCount).toBe(1);
			expect(result.hiddenPaths).toEqual(["hide-me.md"]);

			expect(env.writeFile).toHaveBeenCalledTimes(1);
			expect(env.writeFile).toHaveBeenCalledWith("pull-me.md", "server update");
			expect(syncState.files["pull-me.md"]).toBe(makeHash("server update"));
			// hide: caller handles deletion; syncState unchanged by applyLiveChanges
			expect(syncState.files["hide-me.md"]).toBe("tracked-hash");
		});
	});
});

describe("DATA LOSS: empty server content must not wipe a non-empty layout", () => {
	it("does not overwrite a non-empty _layouts/*.html.json with empty content", async () => {
		// Guard is scoped to isAlwaysPublishable paths (_layouts/*) because the SSE
		// event carries no advertised hash. Layouts are never legitimately blanked —
		// they are deleted, not emptied — so blocking empty-over-non-empty is always safe.
		const path = "_layouts/json-test.html.json";
		const realContent = '{"meta":{},"body":[{"type":"html","html":"<h1>real</h1>"}]}';
		const env = makeEnv({ localFiles: { [path]: realContent }, serverContents: { [path]: "" } });
		const syncState = makeSyncState({ [path]: makeHash(realContent) });
		const result = await applyLiveChanges(env, [upsertChange(path, "update", null)], syncState);
		expect(env.writeFile).not.toHaveBeenCalledWith(path, "");
		expect(result.pulledPaths).toEqual([]);
		expect(syncState.files[path]).toBe(makeHash(realContent));
	});

	it("still pulls an empty server file when no non-empty local copy exists", async () => {
		// A genuine empty note with no local file must still be written (create-like),
		// so the guard must not block empty pulls in general.
		const path = "_layouts/empty.html.json";
		const env = makeEnv({ missingFiles: [path], serverContents: { [path]: "" } });
		const syncState = makeSyncState({});
		const result = await applyLiveChanges(env, [upsertChange(path, "create", null)], syncState);
		expect(env.writeFile).toHaveBeenCalledWith(path, "");
		expect(result.pulledPaths).toEqual([path]);
	});

	it("allows pulling empty content for a non-layout note (legit user empty)", async () => {
		// A user who empties a non-layout note (e.g. note.md) on another device sends a
		// real empty via SSE. Since note.md is not a layout, the guard must not fire.
		const path = "note.md";
		const realContent = "old content";
		const env = makeEnv({ localFiles: { [path]: realContent }, serverContents: { [path]: "" } });
		const syncState = makeSyncState({ [path]: makeHash(realContent) });
		const result = await applyLiveChanges(env, [upsertChange(path, "update", null)], syncState);
		expect(env.writeFile).toHaveBeenCalledWith(path, "");
		expect(result.pulledPaths).toEqual([path]);
		expect(syncState.files[path]).toBe(makeHash(""));
	});
});
