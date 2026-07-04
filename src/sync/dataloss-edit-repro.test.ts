/* eslint-disable @typescript-eslint/unbound-method */
/**
 * REPRO / REGRESSION test for the demo-rig data-loss symptom:
 *
 *   A note (`_index`) was edited locally in Obsidian, then a Sync ran, and
 *   afterward the local buffer showed the ORIGINAL starter text — the typed
 *   content was gone.
 *
 * Two hypotheses:
 *   (a) the typed content never landed on disk (harness focus/timing race —
 *       NOT a product bug);
 *   (b) the two-way sync PULLED the server copy over the local edit (a real
 *       data-loss on the core edit->sync path).
 *
 * This file pins the PRODUCT INVARIANT for (b): when the local copy is strictly
 * NEWER than the server copy (local != lastSynced, remote == lastSynced), a
 * two-way pull must NOT overwrite the local edit. It exercises the three layers
 * where such a clobber could occur:
 *   1. classifyFile  (pure decision)
 *   2. applyLiveChanges (live-pull SSE path — the prime clobber suspect)
 *   3. executePulls   (full classify->execute sync path)
 *
 * If (b) were real, one of these would FAIL (writeFile called with server
 * content / local edit lost). If all pass GREEN, the product logic is correct
 * for a landed local edit, which localizes the demo symptom to (a).
 */
import { describe, it, expect, vi } from "vitest";
import { classifyFile } from "./classify";
import { applyLiveChanges, type LiveApplyEnv } from "./live-apply";
import { executePulls } from "./execute";
import type { SyncState, FileClassification, SyncEnv } from "./types";
import type { NoteChangeItem } from "./LivePullConnection";

function makeHash(content: string): string {
	return `hash:${content}`;
}

const STARTER = "# Welcome\n\nThis is the starter home page.";
// The content typed on-camera during the demo.
const TYPED = "# Welcome\n\nThis is the starter home page.\n\nEdited live on camera!";

describe("DATA-LOSS REPRO: a newer local edit must survive a two-way sync (edit->sync)", () => {
	// Layer 1: pure classifier
	it("classifyFile: local edited, remote == lastSynced -> push (never pull)", () => {
		const localHash = makeHash(TYPED); // user typed -> local is new
		const remoteHash = makeHash(STARTER); // server still has starter
		const lastSyncedHash = makeHash(STARTER); // last sync was the starter

		const action = classifyFile(localHash, remoteHash, lastSyncedHash);

		// The ONLY safe outcomes are push (upload the edit) — pull would lose it.
		expect(action).toBe("push");
		expect(action).not.toBe("pull");
	});

	// Layer 2: live-pull SSE path (applyLiveChanges)
	it("applyLiveChanges: an SSE upsert of the stale server copy must NOT overwrite the newer local edit", async () => {
		const path = "_index.md";
		const env: LiveApplyEnv = {
			fetchNoteContents: vi.fn().mockResolvedValue([{ path, content: STARTER }]),
			fileExists: vi.fn().mockResolvedValue(true),
			computeHash: vi.fn().mockImplementation(async (c: string) => makeHash(c)),
			readFileContent: vi.fn().mockResolvedValue(TYPED), // disk has the typed edit
			writeFile: vi.fn().mockResolvedValue(undefined),
			createFolder: vi.fn().mockResolvedValue(undefined),
		};
		// Last sync recorded the starter hash; the local edit is newer.
		const syncState: SyncState = { files: { [path]: makeHash(STARTER) } };

		// Server broadcasts the (now stale) starter copy back over the bus.
		const change: NoteChangeItem = {
			__typename: "NoteUpsertEvent",
			path,
			eventType: "update",
			versionId: 1,
			title: path,
			noteView: { path, content: STARTER },
		};

		const result = await applyLiveChanges(env, [change], syncState);

		// The local edit must NOT be clobbered.
		expect(env.writeFile).not.toHaveBeenCalled();
		expect(result.pulledPaths).toEqual([]);
		// syncState must still point at the last-synced starter (unchanged).
		expect(syncState.files[path]).toBe(makeHash(STARTER));
	});

	// Layer 3: full classify->execute pull path (executePulls)
	// executePulls is the raw writer. It writes whatever it is told to pull.
	// The invariant that protects the local edit lives UPSTREAM in classifyFile:
	// a newer local edit is never placed in plan.pulls. This test asserts that a
	// correctly-classified plan (push, not pull) leaves executePulls a no-op for
	// the edited file — i.e. the file is never enqueued as a pull.
	it("executePulls: a newer local edit is never enqueued as a pull, so it is never overwritten", async () => {
		const path = "_index.md";

		// Simulate the real pipeline: classify decides the action.
		const action = classifyFile(makeHash(TYPED), makeHash(STARTER), makeHash(STARTER));
		const classification: FileClassification = {
			path,
			action,
			localHash: makeHash(TYPED),
			remoteHash: makeHash(STARTER),
			lastSyncedHash: makeHash(STARTER),
		};
		// Only files whose action === "pull" go into the pulls bucket.
		const pulls = action === "pull" ? [classification] : [];

		const writeFile = vi.fn().mockResolvedValue(undefined);
		const env = {
			fetchNoteContents: vi.fn().mockResolvedValue([{ path, content: STARTER }]),
			computeHash: vi.fn().mockImplementation(async (c: string) => makeHash(c)),
			writeFile,
			createFolder: vi.fn().mockResolvedValue(undefined),
			fileExists: vi.fn().mockResolvedValue(true),
			readFileContent: vi.fn().mockResolvedValue(TYPED),
			onProgress: vi.fn(),
		} as unknown as SyncEnv;
		const syncState: SyncState = { files: { [path]: makeHash(STARTER) } };

		const res = await executePulls(env, pulls, syncState);

		// The edited home page is never pulled -> never overwritten with the starter.
		expect(res.pulledPaths).not.toContain(path);
		expect(writeFile).not.toHaveBeenCalledWith(path, STARTER);
	});
});

describe("HYPOTHESIS (a) — the harness focus-race, reproduced as a precondition", () => {
	// This demonstrates the ONLY way the demo symptom can occur through product
	// logic: the typed content never reached disk before Sync ran. Then, from the
	// sync engine's point of view, local == lastSynced (still the starter), so an
	// SSE upsert of the starter classifies as "unchanged" (no-op) — and crucially,
	// if the server ever had a NEWER copy it would legitimately pull and the buffer
	// would show non-typed content. Either way, the typed bytes are lost because
	// they never existed on disk. That is a harness race, not a sync clobber.
	it("when the local edit never landed (disk still holds the starter), the engine sees no local change", async () => {
		const path = "_index.md";
		// DISK STILL HOLDS THE STARTER — the keystrokes went to a stale/unfocused
		// editor and Obsidian never wrote the buffer before Sync fired.
		const diskContent = STARTER;

		const env: LiveApplyEnv = {
			fetchNoteContents: vi.fn().mockResolvedValue([{ path, content: STARTER }]),
			fileExists: vi.fn().mockResolvedValue(true),
			computeHash: vi.fn().mockImplementation(async (c: string) => makeHash(c)),
			readFileContent: vi.fn().mockResolvedValue(diskContent),
			writeFile: vi.fn().mockResolvedValue(undefined),
			createFolder: vi.fn().mockResolvedValue(undefined),
		};
		const syncState: SyncState = { files: { [path]: makeHash(STARTER) } };

		const change: NoteChangeItem = {
			__typename: "NoteUpsertEvent",
			path,
			eventType: "update",
			versionId: 1,
			title: path,
			noteView: { path, content: STARTER },
		};

		const result = await applyLiveChanges(env, [change], syncState);

		// The engine correctly does nothing — it never had the typed content to lose.
		// classifyFile(hash(STARTER), hash(STARTER), hash(STARTER)) === "unchanged".
		expect(classifyFile(makeHash(diskContent), makeHash(STARTER), makeHash(STARTER)))
			.toBe("unchanged");
		expect(result.pulledPaths).toEqual([]);
		expect(result.conflictCount).toBe(0);
		// The typed content is absent because it was never persisted (hypothesis (a)),
		// NOT because sync overwrote it (hypothesis (b)).
	});
});
