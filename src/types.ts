// Plugin settings
export interface SyncDir {
	path: string;
	apiKey: string;
	apiUrl: string;
	error?: string | null;
	/** Frontmatter field to filter files for push (e.g., "publish"). If empty, all files are synced. */
	publishField?: string;
	/** Enable two-way sync (pull updates from server). Useful for TG channel import or server-side automation. */
	twoWaySync?: boolean;
}

export interface PluginSettings {
	syncDirs: SyncDir[];
	/** Skip push confirmation dialog */
	skipPushConfirmation?: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	syncDirs: [],
	skipPushConfirmation: false,
};

// Sync state - stored locally to track last synced hashes
export interface SyncState {
	// Map of relative path -> lastSyncedHash
	files: Record<string, string>;
	// Timestamp of last sync
	lastSyncedAt?: number;
}

export const DEFAULT_SYNC_STATE: SyncState = {
	files: {},
};

// Sync classification
export type SyncAction = "unchanged" | "pull" | "push" | "conflict" | "local_only" | "remote_only" | "local_deleted" | "server_deleted";

export interface FileClassification {
	path: string;
	action: SyncAction;
	localHash: string | null;
	remoteHash: string | null;
	lastSyncedHash: string | null;
}

// Conflict resolution
export type ConflictResolution = "keep_local" | "keep_remote" | "keep_both" | "skip";

export interface ConflictInfo {
	path: string;
	localContent: string;
	remoteContent: string;
	localHash: string;
	remoteHash: string;
}
