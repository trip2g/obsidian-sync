import type { SyncAction, FileClassification, SyncPlan, ClassifyEnv } from "./types";

/**
 * Classify a single file based on local, remote, and last synced hashes.
 * This is a pure function with no side effects.
 *
 * @param localHash - Hash of local file content, or null if file doesn't exist locally
 * @param remoteHash - Hash of remote file content, or null if file doesn't exist on server
 * @param lastSyncedHash - Hash at the time of last successful sync, or null if never synced
 * @returns The sync action to take for this file
 */
export function classifyFile(
	localHash: string | null,
	remoteHash: string | null,
	lastSyncedHash: string | null
): SyncAction {
	// Stryker disable next-line ConditionalExpression,BlockStatement: equivalent mutant - next condition catches null===null
	// Both null = nothing to do
	if (localHash === null && remoteHash === null) {
		return "unchanged";
	}

	// Hashes match = no changes
	if (localHash === remoteHash) {
		return "unchanged";
	}

	// Stryker disable next-line ConditionalExpression: equivalent mutant - localHash is always non-null here due to previous checks
	// Only local exists
	if (localHash !== null && remoteHash === null) {
		// Was synced before -> deleted on server
		if (lastSyncedHash) {
			return "server_deleted";
		}
		// Never synced -> new local file
		return "local_only";
	}

	// Stryker disable next-line ConditionalExpression: equivalent mutant - remoteHash is always non-null here due to previous checks
	// Only remote exists
	if (localHash === null && remoteHash !== null) {
		// Was synced before -> deleted locally
		if (lastSyncedHash) {
			return "local_deleted";
		}
		// Never synced -> new remote file
		return "remote_only";
	}

	// Stryker disable next-line ConditionalExpression,BlockStatement: equivalent mutant - falls through to final "conflict" return
	// Both exist but differ - need to determine direction
	// First sync for this file -> conflict (can't determine direction)
	if (!lastSyncedHash) {
		return "conflict";
	}

	// Local unchanged, remote changed -> pull
	if (localHash === lastSyncedHash) {
		return "pull";
	}

	// Local changed, remote unchanged -> push
	if (remoteHash === lastSyncedHash) {
		return "push";
	}

	// Both changed -> conflict
	return "conflict";
}

/**
 * Classify all files for sync.
 * Uses ClassifyEnv for dependency injection.
 *
 * @param env - Environment providing file access and state
 * @returns SyncPlan with categorized files
 */
export async function classifySync(env: ClassifyEnv): Promise<SyncPlan> {
	const syncState = env.getSyncState();
	const [localFiles, serverHashes] = await Promise.all([
		env.getLocalFiles(),
		env.getServerHashes(),
	]);

	// Build map for quick lookup
	const serverHashMap = new Map<string, string>();
	for (const item of serverHashes) {
		serverHashMap.set(item.path, item.hash);
	}

	// Compute local hashes with mtime caching
	const localHashes = new Map<string, string>();
	const cachedMtimes = syncState.mtimes || {};
	const cachedLocalHashes = syncState.localHashes || {};

	for (const file of localFiles) {
		const cachedMtime = cachedMtimes[file.path];
		const cachedHash = cachedLocalHashes[file.path];

		if (cachedMtime === file.mtime && cachedHash) {
			// Use cached hash if mtime unchanged
			localHashes.set(file.path, cachedHash);
		} else {
			// Compute new hash
			const content = await env.readFileContent(file.path);
			const hash = await env.computeHash(content);
			localHashes.set(file.path, hash);
		}
	}

	// Collect all unique paths
	const allPaths = new Set<string>([
		...localHashes.keys(),
		...serverHashMap.keys(),
	]);

	// Classify each file
	const classifications: FileClassification[] = [];
	const pulls: FileClassification[] = [];
	const pushes: FileClassification[] = [];
	const conflicts: FileClassification[] = [];
	const localOnly: FileClassification[] = [];
	const remoteOnly: FileClassification[] = [];
	const localDeleted: FileClassification[] = [];
	const serverDeleted: FileClassification[] = [];
	let unchanged = 0;

	for (const path of allPaths) {
		const localHash = localHashes.get(path) || null;
		const remoteHash = serverHashMap.get(path) || null;
		const lastSyncedHash = syncState.files[path] || null;

		const action = classifyFile(localHash, remoteHash, lastSyncedHash);

		const classification: FileClassification = {
			path,
			action,
			localHash,
			remoteHash,
			lastSyncedHash,
		};

		classifications.push(classification);

		switch (action) {
			case "unchanged":
				unchanged++;
				break;
			case "pull":
				pulls.push(classification);
				break;
			case "push":
				pushes.push(classification);
				break;
			case "conflict":
				conflicts.push(classification);
				break;
			case "local_only":
				localOnly.push(classification);
				break;
			case "remote_only":
				remoteOnly.push(classification);
				break;
			case "local_deleted":
				localDeleted.push(classification);
				break;
			case "server_deleted":
				serverDeleted.push(classification);
				break;
		}
	}

	return {
		classifications,
		pulls,
		pushes,
		conflicts,
		localOnly,
		remoteOnly,
		localDeleted,
		serverDeleted,
		unchanged,
	};
}
