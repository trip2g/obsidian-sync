import type {
	SyncPlan,
	SyncResult,
	SyncState,
	SyncEnv,
	FileClassification,
	ConflictInfo,
	ConflictResolution,
	NoteUpdate,
	PushedNote,
	NoteAsset,
	AssetConflictInfo,
	AssetConflictResolution,
	AssetSyncResult,
} from "./types";

export interface ExecuteOptions {
	twoWaySync: boolean;
}

/**
 * Execute a sync plan - performs all pulls, pushes, handles conflicts/deletes, and syncs assets.
 *
 * @param env - Environment providing IO operations
 * @param plan - Sync plan from classifySync + filterPlan
 * @param options - Execution options (twoWaySync affects asset sync behavior)
 * @returns Result with counts of operations performed
 */
export async function executePlan(
	env: SyncEnv,
	plan: SyncPlan,
	options: ExecuteOptions = { twoWaySync: false }
): Promise<SyncResult> {
	const result: SyncResult = {
		pulled: 0,
		pushed: 0,
		conflictsResolved: 0,
		assetsUploaded: 0,
		assetsDownloaded: 0,
		errors: [],
	};

	const syncState = env.getSyncState();

	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - executePulls handles empty array
	// 1. Execute pulls (download from server)
	const pulledPaths: string[] = [];
	if (plan.pulls.length > 0 || plan.remoteOnly.length > 0) {
		const toPull = [...plan.pulls, ...plan.remoteOnly];
		const pullResult = await executePulls(env, toPull, syncState);
		result.pulled = pullResult.count;
		result.errors.push(...pullResult.errors);
		pulledPaths.push(...pullResult.pulledPaths);
	}

	// 1b. Download assets for pulled notes
	if (pulledPaths.length > 0) {
		const assetResult = await downloadAssetsForNotes(env, pulledPaths);
		result.assetsDownloaded += assetResult.downloaded;
		result.errors.push(...assetResult.errors);
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
	let pushedNotes: PushedNote[] = [];
	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - executePushes handles empty array
	if (toPush.length > 0) {
		const confirmed = await env.confirmPush(toPush.map((c) => c.path));
		if (confirmed) {
			const pushResult = await executePushes(env, toPush, syncState);
			result.pushed = pushResult.count;
			result.errors.push(...pushResult.errors);
			pushedNotes = pushResult.pushedNotes;
		}
	}

	// Stryker disable next-line ConditionalExpression,EqualityOperator: optimization - handleLocalDeleted handles empty array
	// 5. Handle local-deleted files (hide on server)
	if (plan.localDeleted.length > 0) {
		await handleLocalDeleted(env, plan.localDeleted, syncState);
	}

	// 6. Sync assets for pushed notes
	if (pushedNotes.length > 0) {
		const assetResult = await syncAssets(env, pushedNotes, options.twoWaySync);
		result.assetsUploaded = assetResult.uploaded;
		result.assetsDownloaded = assetResult.downloaded;
		result.errors.push(...assetResult.errors);
	}

	// 7. Commit all changes
	if (result.pushed > 0 || result.assetsUploaded > 0) {
		await env.commitNotes();
	}

	// 8. Save sync state
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
): Promise<{ count: number; errors: string[]; pulledPaths: string[] }> {
	// Stryker disable all
	// optimization - caller already filters empty
	if (pulls.length === 0) {
		return { count: 0, errors: [], pulledPaths: [] };
	}
	// Stryker restore all

	const paths = pulls.map((p) => p.path);
	const errors: string[] = [];
	const pulledPaths: string[] = [];
	let count = 0;

	env.showProgress(`Pulling ${paths.length} files...`);

	// Fetch contents from server
	const contents = await env.fetchNoteContents(paths);
	const contentMap = new Map(contents.map((c) => [c.path, c.content]));

	const total = pulls.length;
	let current = 0;

	for (const pull of pulls) {
		current++;
		env.updateProgress({ step: "pull", current, total, path: pull.path });

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
			pulledPaths.push(pull.path);
		} catch (e) {
			errors.push(`Failed to write ${pull.path}: ${e}`);
		}
	}

	return { count, errors, pulledPaths };
}

/**
 * Execute push operations - upload files to server.
 */
async function executePushes(
	env: SyncEnv,
	pushes: FileClassification[],
	syncState: SyncState
): Promise<{ count: number; errors: string[]; pushedNotes: PushedNote[] }> {
	// Stryker disable all
	// optimization - caller already filters empty
	if (pushes.length === 0) {
		return { count: 0, errors: [], pushedNotes: [] };
	}
	// Stryker restore all

	const errors: string[] = [];
	const updates: NoteUpdate[] = [];

	env.showProgress(`Pushing ${pushes.length} files...`);

	// Read all file contents
	const total = pushes.length;
	let current = 0;

	for (const push of pushes) {
		current++;
		env.updateProgress({ step: "push", current, total, path: push.path });

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
		return { count: 0, errors, pushedNotes: [] };
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

	// Return only notes that were actually pushed (filter by paths we sent)
	const filteredNotes = pushedNotes.filter((n) => pushedPaths.has(n.path));
	return { count: pushedPaths.size, errors, pushedNotes: filteredNotes };
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

// ============ Asset Sync ============

interface AssetToUpload {
	noteId: string;
	notePath: string;
	asset: NoteAsset;
	localPath: string;
}

interface AssetToDownload {
	asset: NoteAsset;
	localPath: string;
}

/**
 * Sync assets for pushed notes.
 *
 * For each note's assets:
 * - If asset has no sha256Hash on server → upload local file
 * - If asset exists locally with different hash → conflict (or auto-upload in one-way mode)
 * - If asset doesn't exist locally (two-way only) → download from server
 */
async function syncAssets(
	env: SyncEnv,
	pushedNotes: PushedNote[],
	twoWaySync: boolean
): Promise<AssetSyncResult> {
	const result: AssetSyncResult = {
		uploaded: 0,
		downloaded: 0,
		conflictsResolved: 0,
		errors: [],
	};

	// Stryker disable all
	// optimization - caller already filters empty
	if (pushedNotes.length === 0) {
		return result;
	}
	// Stryker restore all

	const toUpload: AssetToUpload[] = [];
	const toDownload: AssetToDownload[] = [];
	const conflicts: AssetConflictInfo[] = [];

	// Classify each asset
	for (const note of pushedNotes) {
		if (!note.assets || note.assets.length === 0) {
			continue;
		}

		for (const asset of note.assets) {
			// Resolve asset path relative to note
			const localPath = await env.resolveAssetPath(asset.path, note.path);
			if (!localPath) {
				// Cannot resolve asset path (e.g., file doesn't exist in Obsidian)
				continue;
			}

			// Asset not yet uploaded to server - need to upload
			if (!asset.sha256Hash || !asset.absolutePath || !asset.url) {
				toUpload.push({ noteId: note.id, notePath: note.path, asset, localPath });
				continue;
			}

			// Check if asset exists locally
			const exists = await env.fileExists(localPath);
			if (exists) {
				// Asset exists locally - check hash
				try {
					const localData = await env.readBinaryFile(localPath);
					const localHash = await env.computeBinaryHash(localData);

					if (localHash === asset.sha256Hash) {
						// Hashes match - no action needed
						continue;
					}

					// Conflict: local and remote differ
					conflicts.push({
						path: asset.path,
						absolutePath: localPath,
						noteId: note.id,
						localHash,
						remoteHash: asset.sha256Hash,
						remoteUrl: asset.url,
					});
				} catch (e) {
					result.errors.push(`Failed to read local asset ${localPath}: ${e}`);
				}
			} else if (twoWaySync) {
				// Asset missing locally - download only if two-way sync is enabled
				toDownload.push({ asset, localPath });
			}
		}
	}

	// Upload new assets (sequentially to avoid overwhelming server)
	// Deduplicate by localPath to avoid uploading same file multiple times
	if (toUpload.length > 0) {
		const uniqueUploads = new Map<string, AssetToUpload>();
		for (const item of toUpload) {
			if (!uniqueUploads.has(item.localPath)) {
				uniqueUploads.set(item.localPath, item);
			}
		}

		const deduped = Array.from(uniqueUploads.values());
		env.showProgress(`Uploading ${deduped.length} assets...`);

		const uploadTotal = deduped.length;
		let uploadCurrent = 0;

		for (const item of deduped) {
			uploadCurrent++;
			env.updateProgress({ step: "upload_asset", current: uploadCurrent, total: uploadTotal, path: item.asset.path });

			try {
				const localData = await env.readBinaryFile(item.localPath);
				const localHash = await env.computeBinaryHash(localData);
				const blob = new Blob([localData]);
				const fileName = item.localPath.substring(item.localPath.lastIndexOf("/") + 1);

				const success = await env.uploadAsset({
					noteId: item.noteId,
					blob,
					fileName,
					relativePath: item.asset.path,
					absolutePath: item.localPath,
					sha256Hash: localHash,
				});

				if (success) {
					result.uploaded++;
				}
			} catch (e) {
				result.errors.push(`Failed to upload asset ${item.asset.path}: ${e}`);
			}
		}
	}

	// Download missing assets (two-way sync only)
	if (toDownload.length > 0) {
		env.showProgress(`Downloading ${toDownload.length} assets...`);

		const downloadTotal = toDownload.length;
		let downloadCurrent = 0;

		for (const item of toDownload) {
			downloadCurrent++;
			env.updateProgress({ step: "download_asset", current: downloadCurrent, total: downloadTotal, path: item.asset.path });

			if (!item.asset.url) {
				continue;
			}

			try {
				const data = await env.downloadAsset(item.asset.url);
				if (!data) {
					result.errors.push(`Failed to download asset ${item.asset.path}`);
					continue;
				}

				// Create directories if needed
				const dirPath = item.localPath.substring(0, item.localPath.lastIndexOf("/"));
				if (dirPath) {
					await env.createFolder(dirPath);
				}

				await env.writeBinaryFile(item.localPath, data);
				result.downloaded++;
			} catch (e) {
				result.errors.push(`Failed to download asset ${item.asset.path}: ${e}`);
			}
		}
	}

	// Handle conflicts
	if (conflicts.length > 0) {
		const assetResult = await handleAssetConflicts(env, conflicts, twoWaySync);
		result.uploaded += assetResult.uploaded;
		result.downloaded += assetResult.downloaded;
		result.conflictsResolved = assetResult.conflictsResolved;
		result.errors.push(...assetResult.errors);
	}

	return result;
}

/**
 * Handle asset conflicts - in one-way mode auto-upload local, in two-way mode ask user.
 */
async function handleAssetConflicts(
	env: SyncEnv,
	conflicts: AssetConflictInfo[],
	twoWaySync: boolean
): Promise<AssetSyncResult> {
	const result: AssetSyncResult = {
		uploaded: 0,
		downloaded: 0,
		conflictsResolved: 0,
		errors: [],
	};

	// Stryker disable all
	// optimization - caller already filters empty
	if (conflicts.length === 0) {
		return result;
	}
	// Stryker restore all

	let resolutions: AssetConflictResolution[];

	if (twoWaySync) {
		// Two-way sync: ask user what to do
		resolutions = await env.onAssetConflict(conflicts);
	} else {
		// One-way sync: auto-upload local assets to server
		resolutions = conflicts.map(() => "keep_local" as const);
	}

	// Process each resolution
	for (let i = 0; i < conflicts.length; i++) {
		const conflict = conflicts[i];
		const resolution = resolutions[i] || "skip";

		try {
			if (resolution === "keep_local") {
				// Upload local asset to server
				const localData = await env.readBinaryFile(conflict.absolutePath);
				const blob = new Blob([localData]);
				const fileName = conflict.absolutePath.substring(conflict.absolutePath.lastIndexOf("/") + 1);

				const success = await env.uploadAsset({
					noteId: conflict.noteId,
					blob,
					fileName,
					relativePath: conflict.path,
					absolutePath: conflict.absolutePath,
					sha256Hash: conflict.localHash,
				});

				if (success) {
					result.uploaded++;
					result.conflictsResolved++;
				}
			} else if (resolution === "keep_remote") {
				// Download from server
				const data = await env.downloadAsset(conflict.remoteUrl);
				if (data) {
					await env.writeBinaryFile(conflict.absolutePath, data);
					result.downloaded++;
					result.conflictsResolved++;
				} else {
					result.errors.push(`Failed to download asset ${conflict.path}`);
				}
			}
			// skip: do nothing
		} catch (e) {
			result.errors.push(`Failed to resolve asset conflict for ${conflict.path}: ${e}`);
		}
	}

	return result;
}

// ============ Asset Download for Pulled Notes ============

/**
 * Download assets for pulled notes.
 * Fetches asset info from server and downloads missing assets.
 */
async function downloadAssetsForNotes(
	env: SyncEnv,
	notePaths: string[]
): Promise<{ downloaded: number; errors: string[] }> {
	const result = { downloaded: 0, errors: [] as string[] };

	if (notePaths.length === 0) {
		return result;
	}

	// Fetch asset info for pulled notes
	const noteAssets = await env.fetchNoteAssets(notePaths);
	if (noteAssets.length === 0) {
		return result;
	}

	// Collect all assets to download (deduplicate by absolutePath)
	const toDownload = new Map<string, { url: string; hash: string }>();
	for (const note of noteAssets) {
		for (const asset of note.assets) {
			if (!toDownload.has(asset.absolutePath)) {
				// Check if asset already exists locally
				const exists = await env.fileExists(asset.absolutePath);
				if (!exists) {
					toDownload.set(asset.absolutePath, { url: asset.url, hash: asset.hash });
				}
			}
		}
	}

	if (toDownload.size === 0) {
		return result;
	}

	env.showProgress(`Downloading ${toDownload.size} assets for pulled notes...`);

	const total = toDownload.size;
	let current = 0;

	for (const [absolutePath, { url }] of toDownload) {
		current++;
		env.updateProgress({ step: "download_asset", current, total, path: absolutePath });

		try {
			const data = await env.downloadAsset(url);
			if (!data) {
				result.errors.push(`Failed to download asset ${absolutePath}`);
				continue;
			}

			// Create directories if needed
			const dirPath = absolutePath.substring(0, absolutePath.lastIndexOf("/"));
			if (dirPath) {
				await env.createFolder(dirPath);
			}

			await env.writeBinaryFile(absolutePath, data);
			result.downloaded++;
		} catch (e) {
			result.errors.push(`Failed to download asset ${absolutePath}: ${e}`);
		}
	}

	return result;
}
