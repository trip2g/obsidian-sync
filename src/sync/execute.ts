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
		updatedUrls: [],
		warnings: [],
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

	// 1c. Check assets for unchanged files (may have missing assets from interrupted sync)
	// Only download assets if two-way sync is enabled
	if (options.twoWaySync) {
		const unchangedServerPaths = plan.classifications
			.filter((c) => c.action === "unchanged" && c.remoteHash !== null)
			.map((c) => c.path);
		if (unchangedServerPaths.length > 0) {
			const assetResult = await downloadAssetsForNotes(env, unchangedServerPaths);
			result.assetsDownloaded += assetResult.downloaded;
			result.errors.push(...assetResult.errors);
		}
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

	// 6. Reconcile assets for pushed notes
	if (pushedNotes.length > 0) {
		const notes: ReconcileNote[] = pushedNotes.map((note) => ({
			id: note.id,
			path: note.path,
			assets: (note.assets ?? []).map((a) => ({
				id: a.path,
				serverHash: a.sha256Hash,
				serverUrl: a.url,
			})),
		}));
		const assetResult = await reconcileAssets(env, notes, options.twoWaySync);
		result.assetsUploaded = assetResult.uploaded;
		result.assetsDownloaded = assetResult.downloaded;
		result.errors.push(...assetResult.errors);
	}

	// 6b. Reconcile missing assets for unchanged notes
	// This handles the case where asset upload failed on previous sync
	const unchangedPaths = plan.classifications
		.filter((c) => c.action === "unchanged" && c.remoteHash !== null)
		.map((c) => c.path);
	if (unchangedPaths.length > 0) {
		const assetResult = await reconcileAssetsForUnchangedNotes(env, unchangedPaths);
		result.assetsUploaded += assetResult.uploaded;
		result.errors.push(...assetResult.errors);
	}

	// 7. Commit all changes
	if (result.pushed > 0 || result.assetsUploaded > 0) {
		const commitResult = await env.commitNotes();
		result.updatedUrls = commitResult.updated.map(({ path, url }) => ({ path, url }));
		for (const note of commitResult.updated) {
			for (const w of note.warnings) {
				result.warnings.push({ path: note.path, level: w.level, message: w.message });
			}
		}
	}

	// 8. Save sync state
	await env.saveSyncState(syncState);

	return result;
}

/**
 * Returns true when a local file exists and has non-empty (non-whitespace)
 * content. Used by the data-loss guard to avoid overwriting real local bytes
 * with empty server content.
 */
async function localFileIsNonEmpty(env: SyncEnv, path: string): Promise<boolean> {
	if (!(await env.fileExists(path))) {
		return false;
	}
	try {
		const local = await env.readFileContent(path);
		return local.trim() !== "";
	} catch {
		return false;
	}
}

/**
 * Execute pull operations - download files from server.
 */
export async function executePulls(
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

	// Fetch contents from server
	const contents = await env.fetchNoteContents(paths);
	const contentMap = new Map(contents.map((c) => [c.path, c.content]));

	const total = pulls.length;
	let current = 0;

	for (const pull of pulls) {
		current++;
		env.onProgress({ step: "pull", current, total, path: pull.path });

		const content = contentMap.get(pull.path);
		if (content === undefined) {
			errors.push(`Failed to fetch: ${pull.path}`);
			continue;
		}

		// DATA-LOSS GUARD: block a lying server — fetched content is empty but the
		// advertised hash is non-empty (= the server returned "" for a path whose
		// real content is non-empty, e.g. a cache-miss resolver bug). Legitimate
		// empties are allowed: when the user genuinely blanks a note, the server
		// advertises hash("") and computeHash("") === pull.remoteHash passes the check.
		const fetchedHash = content.trim() === "" ? await env.computeHash(content) : null;
		if (fetchedHash !== null && fetchedHash !== pull.remoteHash && (await localFileIsNonEmpty(env, pull.path))) {
			errors.push(`Refused to overwrite non-empty ${pull.path} with empty server content (hash mismatch)`);
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
): Promise<{ count: number; errors: string[]; pushedNotes: PushedNote[]; urls: Array<{ path: string; url: string }> }> {
	// Stryker disable all
	// optimization - caller already filters empty
	if (pushes.length === 0) {
		return { count: 0, errors: [], pushedNotes: [], urls: [] };
	}
	// Stryker restore all

	const errors: string[] = [];
	const updates: NoteUpdate[] = [];

	// Read all file contents
	const total = pushes.length;
	let current = 0;

	for (const push of pushes) {
		current++;
		env.onProgress({ step: "push", current, total, path: push.path });

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
		return { count: 0, errors, pushedNotes: [], urls: [] };
	}

	// Track which paths we're pushing
	const updatePaths = new Set(updates.map((u) => u.path));

	// Push to server in batches (skipCommit=true, we'll commit at the end)
	const batchSize = env.pushBatchSize || 100;
	const pushedNotes: PushedNote[] = [];

	for (let i = 0; i < updates.length; i += batchSize) {
		const batch = updates.slice(i, i + batchSize);
		const batchNotes = await env.pushNotes(batch, true);
		pushedNotes.push(...batchNotes);
	}

	// Server returns ALL notes, filter to just the ones we pushed
	const serverPaths = new Set(pushedNotes.map((n) => n.path));

	// Update sync state only for files that are in BOTH our updates AND server response
	let pushedCount = 0;
	for (const update of updates) {
		if (serverPaths.has(update.path)) {
			const hash = await env.computeHash(update.content);
			syncState.files[update.path] = hash;
			pushedCount++;
		}
	}

	// Return only notes that were in our updates (for asset processing)
	const filteredNotes = pushedNotes.filter((n) => updatePaths.has(n.path));
	const urls = filteredNotes
		.filter((n): n is PushedNote & { url: string } => typeof n.url === "string")
		.map((n) => ({ path: n.path, url: n.url }));
	return { count: pushedCount, errors, pushedNotes: filteredNotes, urls };
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
			console.warn(`Failed to read local file for conflict ${conflict.path}:`, e);
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

		case "keep_both": {
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
		}

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
				console.warn(`Failed to delete file ${c.path}:`, e);
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

/** A note whose assets should be reconciled against the server. */
interface ReconcileNote {
	/** Version id used as uploadAsset's noteId. */
	id: string;
	path: string;
	assets: ReconcileAsset[];
}

interface ReconcileAsset {
	/** Wikilink/relative-path identifier, e.g. "image.png" or "_layouts/mesh/x.mp4". */
	id: string;
	/** SHA256 recorded on the server, or null/"" if not uploaded yet. */
	serverHash: string | null;
	/** Download URL recorded on the server, or null/"" if not uploaded yet. */
	serverUrl: string | null;
}

interface ReconcileUpload {
	noteId: string;
	assetId: string;
	localPath: string;
	localHash: string;
}

interface ReconcileDownload {
	assetId: string;
	url: string;
	localPath: string;
}

/**
 * Single reconciliation routine for both pushed and unchanged notes.
 *
 * Every local path is resolved via env.resolveAssetPath(asset.id, note.path)
 * (never a bespoke join), and each asset is classified with one code path:
 *   - no server hash/url recorded → upload
 *   - local hash === server hash  → skip
 *   - hashes differ               → conflict (one-way mode: auto keep-local)
 *
 * Downloads only happen in two-way mode when the asset is missing locally.
 */
async function reconcileAssets(
	env: SyncEnv,
	notes: ReconcileNote[],
	twoWaySync: boolean
): Promise<AssetSyncResult> {
	const result: AssetSyncResult = {
		uploaded: 0,
		downloaded: 0,
		conflictsResolved: 0,
		errors: [],
	};

	const toUpload: ReconcileUpload[] = [];
	const toDownload: ReconcileDownload[] = [];
	const conflicts: AssetConflictInfo[] = [];

	for (const note of notes) {
		for (const asset of note.assets) {
			const localPath = await env.resolveAssetPath(asset.id, note.path);
			if (!localPath) {
				// Cannot resolve asset path (e.g., file doesn't exist locally)
				continue;
			}

			const exists = await env.fileExists(localPath);
			const onServer = !!asset.serverHash && !!asset.serverUrl;

			if (!onServer) {
				// Not uploaded yet — upload if we have a local copy.
				if (!exists) {
					continue;
				}
				try {
					const localData = await env.readBinaryFile(localPath);
					const localHash = await env.computeBinaryHash(localData);
					toUpload.push({ noteId: note.id, assetId: asset.id, localPath, localHash });
				} catch (e) {
					result.errors.push(`Failed to read local asset ${localPath}: ${e}`);
				}
				continue;
			}

			if (!exists) {
				// On server but missing locally — download only when two-way sync is on.
				if (twoWaySync) {
					toDownload.push({ assetId: asset.id, url: asset.serverUrl as string, localPath });
				}
				continue;
			}

			try {
				const localData = await env.readBinaryFile(localPath);
				const localHash = await env.computeBinaryHash(localData);
				if (localHash === asset.serverHash) {
					// Hashes match - no action needed
					continue;
				}
				conflicts.push({
					path: asset.id,
					absolutePath: localPath,
					noteId: note.id,
					localHash,
					remoteHash: asset.serverHash as string,
					remoteUrl: asset.serverUrl as string,
				});
			} catch (e) {
				result.errors.push(`Failed to read local asset ${localPath}: ${e}`);
			}
		}
	}

	// Upload new assets, deduped by (noteId, localPath) - same file may back multiple notes.
	if (toUpload.length > 0) {
		const unique = new Map<string, ReconcileUpload>();
		for (const item of toUpload) {
			const key = `${item.noteId}:${item.localPath}`;
			if (!unique.has(key)) {
				unique.set(key, item);
			}
		}

		const deduped = Array.from(unique.values());
		const uploadTotal = deduped.length;
		let uploadCurrent = 0;

		for (const item of deduped) {
			uploadCurrent++;
			env.onProgress({ step: "upload_asset", current: uploadCurrent, total: uploadTotal, path: item.assetId });

			try {
				const localData = await env.readBinaryFile(item.localPath);
				const blob = new Blob([localData]);
				const fileName = item.localPath.substring(item.localPath.lastIndexOf("/") + 1);

				const success = await env.uploadAsset({
					noteId: item.noteId,
					blob,
					fileName,
					relativePath: item.assetId,
					absolutePath: item.localPath,
					sha256Hash: item.localHash,
				});

				if (success) {
					result.uploaded++;
				}
			} catch (e) {
				result.errors.push(`Failed to upload asset ${item.assetId}: ${e}`);
			}
		}
	}

	// Download missing assets (two-way sync only).
	if (toDownload.length > 0) {
		const downloadTotal = toDownload.length;
		let downloadCurrent = 0;

		for (const item of toDownload) {
			downloadCurrent++;
			env.onProgress({ step: "download_asset", current: downloadCurrent, total: downloadTotal, path: item.assetId });

			try {
				const data = await env.downloadAsset(item.url);
				if (!data) {
					result.errors.push(`Failed to download asset ${item.assetId}`);
					continue;
				}

				const dirPath = item.localPath.substring(0, item.localPath.lastIndexOf("/"));
				if (dirPath) {
					await env.createFolder(dirPath);
				}

				await env.writeBinaryFile(item.localPath, data);
				result.downloaded++;
			} catch (e) {
				result.errors.push(`Failed to download asset ${item.assetId}: ${e}`);
			}
		}
	}

	if (conflicts.length > 0) {
		const assetResult = await handleAssetConflicts(env, conflicts, twoWaySync);
		result.uploaded += assetResult.uploaded;
		result.downloaded += assetResult.downloaded;
		result.conflictsResolved += assetResult.conflictsResolved;
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
export async function downloadAssetsForNotes(
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
			// Strip leading slash - Obsidian paths don't start with /
			const absolutePath = asset.absolutePath.replace(/^\//, "");
			if (!toDownload.has(absolutePath)) {
				// Check if asset already exists locally
				const exists = await env.fileExists(absolutePath);
				if (!exists) {
					toDownload.set(absolutePath, { url: asset.url, hash: asset.hash });
				}
			}
		}
	}

	if (toDownload.size === 0) {
		return result;
	}

	const total = toDownload.size;
	let current = 0;

	for (const [absolutePath, { url }] of toDownload) {
		current++;
		env.onProgress({ step: "download_asset", current, total, path: absolutePath });

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

// ============ Asset Upload for Unchanged Notes ============

/**
 * Reconcile assets for unchanged notes (upload-only, one-way): handles the case
 * where asset upload failed on a previous sync or a referenced file changed.
 * Delegates to the shared reconcileAssets routine.
 */
async function reconcileAssetsForUnchangedNotes(
	env: SyncEnv,
	notePaths: string[]
): Promise<AssetSyncResult> {
	if (notePaths.length === 0) {
		return { uploaded: 0, downloaded: 0, conflictsResolved: 0, errors: [] };
	}

	const noteAssets = await env.fetchNoteAssets(notePaths);
	const notes: ReconcileNote[] = noteAssets.map((note) => ({
		id: note.noteId,
		path: note.path,
		assets: note.assets.map((a) => ({
			id: a.id,
			serverHash: a.hash || null,
			serverUrl: a.url || null,
		})),
	}));

	// Unchanged notes are reconciled upload-only (one-way): no downloads, no prompts.
	return reconcileAssets(env, notes, false);
}
