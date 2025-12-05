// Plugin settings
export interface SyncDir {
	path: string;
	apiKey: string;
	apiUrl: string;
	error?: string | null;
	/** Frontmatter field to filter files for push (e.g., "publish"). If empty, all files are synced. */
	publishField?: string;
}

export interface PluginSettings {
	syncDirs: SyncDir[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
	syncDirs: [],
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

// API response types
export interface NoteAsset {
	path: string;
	sha256Hash: string;
}

export interface NoteWithAssets {
	id: string;
	path: string;
	assets?: NoteAsset[];
}

export interface ServerNotePath {
	path: string;
	hash: string;
}

export interface ServerNoteContent {
	path: string;
	content: string;
}

// Asset from server (for download during pull)
export interface RemoteAsset {
	id: string; // path reference in note (e.g., "image.png")
	url: string; // full URL to download
	hash: string; // SHA256 hash
}

export interface NoteContentWithAssets {
	content: string;
	assets: RemoteAsset[];
}

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
