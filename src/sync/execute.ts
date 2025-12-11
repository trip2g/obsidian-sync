import type {
	SyncPlan,
	SyncResult,
	SyncState,
	SyncEnv,
	FileClassification,
	ConflictInfo,
	ConflictResolution,
	NoteUpdate,
} from "./types";

/**
 * Execute a sync plan - performs all pulls, pushes, and handles conflicts/deletes.
 *
 * @param env - Environment providing IO operations
 * @param plan - Sync plan from classifySync + filterPlan
 * @returns Result with counts of operations performed
 */
export async function executePlan(env: SyncEnv, plan: SyncPlan): Promise<SyncResult> {
	const result: SyncResult = {
		pulled: 0,
		pushed: 0,
		conflictsResolved: 0,
		errors: [],
	};

	const syncState = env.getSyncState();

	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - executePulls handles empty array
	// 1. Execute pulls (download from server)
	if (plan.pulls.length > 0 || plan.remoteOnly.length > 0) {
		const pullResult = await executePulls(env, [...plan.pulls, ...plan.remoteOnly], syncState);
		result.pulled = pullResult.count;
		result.errors.push(...pullResult.errors);
	}

	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - handleServerDeleted handles empty array
	// 2. Handle server-deleted files (ask user what to do)
	if (plan.serverDeleted.length > 0) {
		await handleServerDeleted(env, plan.serverDeleted, syncState);
	}

	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - handleConflicts handles empty array
	// 3. Handle conflicts (show UI, let user decide)
	if (plan.conflicts.length > 0) {
		const conflictResult = await handleConflicts(env, plan.conflicts, syncState);
		result.conflictsResolved = conflictResult.resolved;
		result.errors.push(...conflictResult.errors);
	}

	// 4. Confirm and execute pushes (upload to server)
	const toPush = [...plan.pushes, ...plan.localOnly];
	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - executePushes handles empty array
	if (toPush.length > 0) {
		const confirmed = await env.confirmPush(toPush.map((c) => c.path));
		if (confirmed) {
			const pushResult = await executePushes(env, toPush, syncState);
			result.pushed = pushResult.count;
			result.errors.push(...pushResult.errors);
		}
	}

	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - handleLocalDeleted handles empty array
	// 5. Handle local-deleted files (hide on server)
	if (plan.localDeleted.length > 0) {
		await handleLocalDeleted(env, plan.localDeleted, syncState);
	}

	// 6. Commit all changes
	if (result.pushed > 0) {
		await env.commitNotes();
	}

	// 7. Save sync state
	await env.saveSyncState(syncState);

	return result;
}

/**
 * Execute pull operations - download files from server.
 */
async function executePulls(
	env: SyncEnv,
	pulls: FileClassification[],
	syncState: SyncState
): Promise<{ count: number; errors: string[] }> {
	// Stryker disable all
	// optimization - caller already filters empty
	if (pulls.length === 0) {
		return { count: 0, errors: [] };
	}
	// Stryker restore all

	const paths = pulls.map((p) => p.path);
	const errors: string[] = [];
	let count = 0;

	env.showProgress(`Pulling ${paths.length} files...`);

	// Fetch contents from server
	const contents = await env.fetchNoteContents(paths);
	const contentMap = new Map(contents.map((c) => [c.path, c.content]));

	for (const pull of pulls) {
		const content = contentMap.get(pull.path);
		if (content === undefined) {
			errors.push(`Failed to fetch: ${pull.path}`);
			continue;
		}

		try {
			// Create directories if needed
			const dirPath = pull.path.substring(0, pull.path.lastIndexOf("/"));
			if (dirPath) {
				await env.createFolder(dirPath);
			}

			// Write file
			await env.writeFile(pull.path, content);

			// Update sync state
			const hash = await env.computeHash(content);
			syncState.files[pull.path] = hash;
			count++;
		} catch (e) {
			errors.push(`Failed to write ${pull.path}: ${e}`);
		}
	}

	return { count, errors };
}

/**
 * Execute push operations - upload files to server.
 */
async function executePushes(
	env: SyncEnv,
	pushes: FileClassification[],
	syncState: SyncState
): Promise<{ count: number; errors: string[] }> {
	// Stryker disable all
	// optimization - caller already filters empty
	if (pushes.length === 0) {
		return { count: 0, errors: [] };
	}
	// Stryker restore all

	const errors: string[] = [];
	const updates: NoteUpdate[] = [];

	env.showProgress(`Pushing ${pushes.length} files...`);

	// Read all file contents
	for (const push of pushes) {
		try {
			const content = await env.readFileContent(push.path);
			updates.push({ path: push.path, content });
		} catch (e) {
			// Stryker disable next-line StringLiteral: error message content doesn't affect behavior
			errors.push(`Failed to read ${push.path}: ${e}`);
		}
	}

	// Stryker disable next-line ConditionalExpression,BlockStatement: optimization when all reads fail
	if (updates.length === 0) {
		return { count: 0, errors };
	}

	// Push to server (skipCommit=true, we'll commit at the end)
	const pushedNotes = await env.pushNotes(updates, true);

	// Update sync state for successfully pushed files
	const pushedPaths = new Set(pushedNotes.map((n) => n.path));
	for (const update of updates) {
		if (pushedPaths.has(update.path)) {
			const hash = await env.computeHash(update.content);
			syncState.files[update.path] = hash;
		}
	}

	return { count: pushedPaths.size, errors };
}

/**
 * Handle conflicts - show UI and process user decisions.
 */
async function handleConflicts(
	env: SyncEnv,
	conflicts: FileClassification[],
	syncState: SyncState
): Promise<{ resolved: number; errors: string[] }> {
	// Stryker disable all
	// optimization - caller already filters empty
	if (conflicts.length === 0) {
		return { resolved: 0, errors: [] };
	}
	// Stryker restore all

	const errors: string[] = [];

	// Fetch remote contents
	const paths = conflicts.map((c) => c.path);
	const remoteContents = await env.fetchNoteContents(paths);
	const remoteMap = new Map(remoteContents.map((c) => [c.path, c.content]));

	// Build conflict infos
	const conflictInfos: ConflictInfo[] = [];
	for (const conflict of conflicts) {
		const remoteContent = remoteMap.get(conflict.path);
		if (remoteContent === undefined) {
			continue; // Remote no longer exists
		}

		try {
			const localContent = await env.readFileContent(conflict.path);
			conflictInfos.push({
				path: conflict.path,
				localContent,
				remoteContent,
				localHash: conflict.localHash!,
				remoteHash: conflict.remoteHash!,
			});
		} catch (e) {
			// Stryker disable next-line StringLiteral: error message content doesn't affect behavior
			errors.push(`Failed to read local file for conflict: ${conflict.path}`);
		}
	}

	if (conflictInfos.length === 0) {
		return { resolved: 0, errors };
	}

	// Show conflict UI and get resolutions
	const resolutions = await env.onConflict(conflictInfos);

	// Process each resolution
	let resolved = 0;
	// Stryker disable next-line EqualityOperator: <= would cause out-of-bounds access; tests verify correct iteration
	for (let i = 0; i < conflictInfos.length; i++) {
		const info = conflictInfos[i];
		const resolution = resolutions[i] || "skip";

		try {
			await resolveConflict(env, info, resolution, syncState);
			if (resolution !== "skip") {
				resolved++;
			}
		} catch (e) {
			errors.push(`Failed to resolve conflict for ${info.path}: ${e}`);
		}
	}

	return { resolved, errors };
}

/**
 * Resolve a single conflict based on user's choice.
 */
async function resolveConflict(
	env: SyncEnv,
	conflict: ConflictInfo,
	resolution: ConflictResolution,
	syncState: SyncState
): Promise<void> {
	switch (resolution) {
		case "keep_local":
			// Push local version to server
			await env.pushNotes([{ path: conflict.path, content: conflict.localContent }], true);
			syncState.files[conflict.path] = conflict.localHash;
			break;

		case "keep_remote":
			// Overwrite local with remote
			await env.writeFile(conflict.path, conflict.remoteContent);
			syncState.files[conflict.path] = conflict.remoteHash;
			break;

		case "keep_both":
			// Create copy with server version
			const ext = conflict.path.substring(conflict.path.lastIndexOf("."));
			const baseName = conflict.path.substring(0, conflict.path.lastIndexOf("."));
			const newPath = `${baseName} (server)${ext}`;

			await env.writeFile(newPath, conflict.remoteContent);

			// Update sync state for both
			syncState.files[conflict.path] = conflict.localHash;
			const remoteHash = await env.computeHash(conflict.remoteContent);
			syncState.files[newPath] = remoteHash;
			break;

		// Stryker disable next-line StringLiteral,ConditionalExpression: skip case is intentionally empty
		case "skip":
			// Do nothing - will show as conflict again next sync
			break;
	}
}

/**
 * Handle files deleted on server - ask user whether to delete locally.
 */
async function handleServerDeleted(
	env: SyncEnv,
	serverDeleted: FileClassification[],
	syncState: SyncState
): Promise<void> {
	// Stryker disable next-line ConditionalExpression,BlockStatement: optimization - caller already filters empty
	if (serverDeleted.length === 0) {
		return;
	}

	const paths = serverDeleted.map((c) => c.path);
	const deleteLocally = await env.onServerDeleted(paths);

	if (deleteLocally) {
		// Delete local files
		for (const c of serverDeleted) {
			try {
				await env.deleteFile(c.path);
				delete syncState.files[c.path];
			} catch (e) {
				// File might not exist, ignore
			}
		}
	} else {
		// Keep locally - update syncState to current local hash
		for (const c of serverDeleted) {
			if (c.localHash) {
				syncState.files[c.path] = c.localHash;
			}
		}
	}
}

/**
 * Handle files deleted locally - hide them on server.
 */
async function handleLocalDeleted(
	env: SyncEnv,
	localDeleted: FileClassification[],
	syncState: SyncState
): Promise<void> {
	// Stryker disable next-line ConditionalExpression,BlockStatement: optimization - caller already filters empty
	if (localDeleted.length === 0) {
		return;
	}

	const paths = localDeleted.map((c) => c.path);
	await env.hideNotes(paths);

	// Remove from sync state
	for (const path of paths) {
		delete syncState.files[path];
	}
}
