import type { SyncAction, FileClassification, SyncState } from "./types";

/**
 * Compute SHA-256 hash of a string content (for text files)
 */
export async function sha256Hash(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = new Uint8Array(hashBuffer);
	return btoa(String.fromCharCode(...hashArray))
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

/**
 * Compute SHA-256 hash of binary data (for assets)
 */
export async function sha256HashBuffer(buffer: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
	const hashArray = new Uint8Array(hashBuffer);
	return Array.from(hashArray)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Classify a file based on local, remote, and lastSynced hashes
 *
 * The logic:
 * - If local == remote: UNCHANGED (no action needed)
 * - If lastSynced is empty (first sync for this file):
 *   - If local exists and remote doesn't: LOCAL_ONLY (push)
 *   - If remote exists and local doesn't: REMOTE_ONLY (pull or hide)
 *   - If both exist but differ: CONFLICT (ask user)
 * - If local == lastSynced && remote != lastSynced: PULL (remote changed)
 * - If local != lastSynced && remote == lastSynced: PUSH (local changed)
 * - If local != lastSynced && remote != lastSynced: CONFLICT (both changed)
 */
export function classifyFile(
	localHash: string | null,
	remoteHash: string | null,
	lastSyncedHash: string | null
): SyncAction {
	// Both hashes match - no sync needed
	if (localHash === remoteHash) {
		return "unchanged";
	}

	// File only exists locally
	if (localHash !== null && remoteHash === null) {
		return "local_only";
	}

	// File only exists on server
	if (localHash === null && remoteHash !== null) {
		// Had lastSyncedHash = file was synced before, now deleted locally
		if (lastSyncedHash !== null && lastSyncedHash !== "") {
			return "local_deleted";
		}
		// No lastSyncedHash = new file from server, need to pull
		return "pull";
	}

	// First sync for this file (no lastSyncedHash)
	if (lastSyncedHash === null || lastSyncedHash === "") {
		// Both exist but differ - conflict
		return "conflict";
	}

	// Local unchanged, remote changed - pull
	if (localHash === lastSyncedHash && remoteHash !== lastSyncedHash) {
		return "pull";
	}

	// Local changed, remote unchanged - push
	if (localHash !== lastSyncedHash && remoteHash === lastSyncedHash) {
		return "push";
	}

	// Both changed - conflict
	return "conflict";
}

/**
 * Classify all files in a sync operation
 */
export function classifyAllFiles(
	localFiles: Map<string, string>, // path -> hash
	serverHashes: Map<string, string>, // path -> hash
	syncState: SyncState
): FileClassification[] {
	const classifications: FileClassification[] = [];
	const allPaths = new Set<string>([...localFiles.keys(), ...serverHashes.keys()]);

	for (const path of allPaths) {
		const localHash = localFiles.get(path) ?? null;
		const remoteHash = serverHashes.get(path) ?? null;
		const lastSyncedHash = syncState.files[path] ?? null;

		const action = classifyFile(localHash, remoteHash, lastSyncedHash);

		classifications.push({
			path,
			action,
			localHash,
			remoteHash,
			lastSyncedHash,
		});
	}

	return classifications;
}

/**
 * Update sync state after successful sync operations
 */
export function updateSyncState(syncState: SyncState, path: string, hash: string): void {
	syncState.files[path] = hash;
	syncState.lastSyncedAt = Date.now();
}

/**
 * Remove a file from sync state (e.g., when hidden)
 */
export function removeFromSyncState(syncState: SyncState, path: string): void {
	delete syncState.files[path];
}

/**
 * Generate a simple line-based diff for display
 */
export function generateSimpleDiff(local: string, remote: string): { added: number; removed: number; lines: string[] } {
	const localLines = local.split("\n");
	const remoteLines = remote.split("\n");

	const diffLines: string[] = [];
	let added = 0;
	let removed = 0;

	// Simple line-by-line comparison (not a true diff algorithm)
	const maxLen = Math.max(localLines.length, remoteLines.length);

	for (let i = 0; i < maxLen; i++) {
		const localLine = localLines[i];
		const remoteLine = remoteLines[i];

		if (localLine === remoteLine) {
			diffLines.push(`  ${localLine ?? ""}`);
		} else if (localLine !== undefined && remoteLine === undefined) {
			diffLines.push(`- ${localLine}`);
			removed++;
		} else if (localLine === undefined && remoteLine !== undefined) {
			diffLines.push(`+ ${remoteLine}`);
			added++;
		} else {
			diffLines.push(`- ${localLine}`);
			diffLines.push(`+ ${remoteLine}`);
			added++;
			removed++;
		}
	}

	return { added, removed, lines: diffLines };
}

/**
 * Check if changes are "small" enough to show inline diff
 */
export function isSmallChange(local: string, remote: string, threshold = 10): boolean {
	const diff = generateSimpleDiff(local, remote);
	return diff.added + diff.removed <= threshold;
}
