import type { NoteChangeItem } from "./LivePullConnection";
import type { SyncState } from "./types";
import { classifyFile } from "./classify";

/**
 * Minimal env interface for applyLiveChanges.
 * Modelled on the primitives used by autoPull / executePulls.
 */
export interface LiveApplyEnv {
	fetchNoteContents(paths: string[]): Promise<Array<{ path: string; content: string }>>;
	fileExists(path: string): Promise<boolean>;
	computeHash(content: string): Promise<string>;
	readFileContent(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
}

export interface ApplyLiveChangesResult {
	/** Paths that were pulled (written) from the server. */
	pulledPaths: string[];
	/** Number of changes that classified as conflict (no write performed). */
	conflictCount: number;
	/**
	 * Hide-eligible paths: files that exist locally AND are tracked in syncState.
	 * The caller is responsible for routing these through a confirmation modal
	 * (never auto-delete). applyLiveChanges does NOT delete them.
	 */
	hiddenPaths: string[];
}

/**
 * Apply a batch of live-pull SSE changes to the local vault and update syncState.
 *
 * Decision logic (mirrors autoPull in main.ts):
 * - NoteUpsertEvent: classify via classifyFile; write only when action is "pull"
 *   or when it is a "create" event with no local copy. On conflict, increment
 *   conflictCount but do NOT write. On push/unchanged, skip.
 * - NoteHideEvent: collect paths that exist locally AND are tracked in syncState
 *   as `hiddenPaths`. The caller is responsible for user confirmation and the
 *   actual delete+syncState mutation. applyLiveChanges does NOT auto-delete.
 *
 * After writing a file, sets `syncState.files[path] = computeHash(content)`
 * (mirroring executePulls execute.ts:196-197).
 *
 * Callers are responsible for persisting syncState and showing UI notices.
 */
export async function applyLiveChanges(
	env: LiveApplyEnv,
	changes: NoteChangeItem[],
	syncState: SyncState
): Promise<ApplyLiveChangesResult> {
	const pulledPaths: string[] = [];
	let conflictCount = 0;
	const hiddenPaths: string[] = [];

	// Collect upserts that need content fetched (inline noteView absent).
	const upserts = changes.filter(
		(c): c is Extract<NoteChangeItem, { __typename: "NoteUpsertEvent" }> =>
			c.__typename === "NoteUpsertEvent"
	);
	const missingContentPaths = upserts
		.filter((c) => c.noteView === null)
		.map((c) => c.path);

	const fetchedContent = new Map<string, string>();
	if (missingContentPaths.length > 0) {
		const contents = await env.fetchNoteContents(missingContentPaths);
		for (const c of contents) {
			fetchedContent.set(c.path, c.content);
		}
	}

	for (const change of changes) {
		if (change.__typename === "NoteHideEvent") {
			// Only consider hiding files we have locally and have synced before.
			// The caller (e.g. handleLiveHide in main.ts) is responsible for
			// showing a confirmation modal and performing the actual delete.
			if (
				(await env.fileExists(change.path)) &&
				syncState.files[change.path] !== undefined
			) {
				hiddenPaths.push(change.path);
			}
			continue;
		}

		// NoteUpsertEvent
		const content = change.noteView?.content ?? fetchedContent.get(change.path);
		if (content === undefined) {
			// Content unavailable — defer to the periodic reconcile.
			continue;
		}

		const remoteHash = await env.computeHash(content);

		const exists = await env.fileExists(change.path);
		const localHash = exists
			? await env.computeHash(await env.readFileContent(change.path))
			: null;
		const lastSynced = syncState.files[change.path] ?? null;

		// Special case: create event with no local copy → always pull.
		if (change.eventType === "create" && localHash === null) {
			await writeAndRecord(env, syncState, change.path, content, remoteHash, pulledPaths);
			continue;
		}

		const action = classifyFile(localHash, remoteHash, lastSynced);
		if (action === "pull") {
			await writeAndRecord(env, syncState, change.path, content, remoteHash, pulledPaths);
		} else if (action === "conflict") {
			conflictCount++;
		}
		// unchanged / push / others: skip — no write, no syncState mutation.
	}

	return { pulledPaths, conflictCount, hiddenPaths };
}

/** Write file (creating parent dirs if needed) and update syncState. */
async function writeAndRecord(
	env: LiveApplyEnv,
	syncState: SyncState,
	path: string,
	content: string,
	remoteHash: string,
	pulledPaths: string[]
): Promise<void> {
	const dirPath = path.substring(0, path.lastIndexOf("/"));
	if (dirPath) {
		await env.createFolder(dirPath);
	}
	await env.writeFile(path, content);
	syncState.files[path] = remoteHash;
	pulledPaths.push(path);
}
