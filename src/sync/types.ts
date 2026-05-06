// ============ Sync Actions ============

export type SyncAction =
	| "unchanged"
	| "push"
	| "pull"
	| "conflict"
	| "local_only"
	| "remote_only"
	| "local_deleted"
	| "server_deleted";

// ============ File Types ============

export interface LocalFile {
	path: string; // relative to sync folder
	mtime: number;
}

export interface ServerHash {
	path: string;
	hash: string;
}

export interface FileClassification {
	path: string;
	action: SyncAction;
	localHash: string | null;
	remoteHash: string | null;
	lastSyncedHash: string | null;
}

// ============ Sync State ============

export interface SyncState {
	files: Record<string, string>; // path -> lastSyncedHash
	lastSyncedAt?: number;
	// Cache for performance (does NOT affect sync logic)
	mtimes?: Record<string, number>; // path -> mtime (cache validation)
	localHashes?: Record<string, string>; // path -> computed hash
}

// ============ Sync Plan ============

export interface SyncPlan {
	classifications: FileClassification[];
	pulls: FileClassification[];
	pushes: FileClassification[];
	conflicts: FileClassification[];
	localOnly: FileClassification[];
	remoteOnly: FileClassification[];
	localDeleted: FileClassification[];
	serverDeleted: FileClassification[];
	unchanged: number;
}

// ============ Sync Result ============

export interface SyncResult {
	pulled: number;
	pushed: number;
	conflictsResolved: number;
	assetsUploaded: number;
	assetsDownloaded: number;
	errors: string[];
	updatedUrls: Array<{ path: string; url: string }>;
	warnings: Array<{ path: string; level: string; message: string }>;
}

// ============ Filter Options ============

export interface FilterOptions {
	twoWaySync: boolean;
	// Callback to check if file has any of the publishFields set to true
	// If not provided, all files are considered publishable
	hasPublishFields?: (path: string) => boolean;
}

// ============ Env Interfaces ============

export interface ClassifyEnv {
	// Data retrieval
	getLocalFiles(): Promise<LocalFile[]>;
	getServerHashes(): Promise<ServerHash[]>;
	getSyncState(): SyncState;

	// Operations
	computeHash(content: string): Promise<string>;
	readFileContent(path: string): Promise<string>;
}

export interface NoteUpdate {
	path: string;
	content: string;
}

export interface PushedNote {
	id: string;
	path: string;
	assets: NoteAsset[];
	url?: string | null;
}

export interface NoteAsset {
	path: string;
	sha256Hash: string | null;
	absolutePath: string | null;
	url: string | null;
}

export interface NoteContent {
	path: string;
	content: string;
}

export interface NoteAssetInfo {
	path: string;
	noteId: string; // version ID for upload
	assets: Array<{
		/** Wikilink id (e.g., "image.png") */
		id: string;
		/** Download URL */
		url: string;
		/** SHA256 hash for verification */
		hash: string;
		/** Resolved path in vault (e.g., "assets/image.png") */
		absolutePath: string;
	}>;
}

export interface UploadAssetParams {
	noteId: string;
	blob: Blob;
	fileName: string;
	relativePath: string;
	absolutePath: string;
	sha256Hash: string;
}

export interface ConflictInfo {
	path: string;
	localContent: string;
	remoteContent: string;
	localHash: string;
	remoteHash: string;
}

export type ConflictResolution = "keep_local" | "keep_remote" | "keep_both" | "skip";

// ============ Asset Types ============

export interface AssetConflictInfo {
	/** Wikilink path (e.g., "image.png") */
	path: string;
	/** Full path in vault (e.g., "folder/image.png") */
	absolutePath: string;
	/** Note ID for upload */
	noteId: string;
	localHash: string;
	remoteHash: string;
	remoteUrl: string;
}

export type AssetConflictResolution = "keep_local" | "keep_remote" | "skip";

// ============ Progress Types ============

export type ProgressStep =
	| "classify"
	| "pull"
	| "push"
	| "upload_asset"
	| "download_asset"
	| "conflict"
	| "commit";

export interface Progress {
	step: ProgressStep;
	current: number;
	total: number;
	/** Optional: current item path for detailed progress */
	path?: string;
}

export interface AssetSyncResult {
	uploaded: number;
	downloaded: number;
	conflictsResolved: number;
	errors: string[];
}

export interface NoteWarning {
	level: string;
	message: string;
}

export interface CommitNotesResult {
	updated: Array<{ path: string; url: string; warnings: NoteWarning[] }>;
}

export interface SyncEnv extends ClassifyEnv {
	// Configuration
	/** Batch size for pushNotes calls (default: 100) */
	pushBatchSize: number;

	// File operations
	writeFile(path: string, content: string): Promise<void>;
	writeBinaryFile(path: string, data: ArrayBuffer): Promise<void>;
	readBinaryFile(path: string): Promise<ArrayBuffer>;
	deleteFile(path: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	fileExists(path: string): Promise<boolean>;

	// Server operations
	pushNotes(updates: NoteUpdate[], skipCommit: boolean): Promise<PushedNote[]>;
	hideNotes(paths: string[]): Promise<void>;
	fetchNoteContents(paths: string[]): Promise<NoteContent[]>;
	fetchNoteAssets(paths: string[]): Promise<NoteAssetInfo[]>;
	uploadAsset(params: UploadAssetParams): Promise<boolean>;
	downloadAsset(url: string): Promise<ArrayBuffer | null>;
	commitNotes(): Promise<CommitNotesResult>;

	// Asset operations
	/** Compute SHA256 hash for binary data (URL-safe base64 with padding) */
	computeBinaryHash(data: ArrayBuffer): Promise<string>;
	/**
	 * Resolve wikilink asset path to absolute path in vault.
	 * E.g., "image.png" referenced from "folder/note.md" -> "folder/image.png" or "assets/image.png"
	 * Returns null if asset cannot be resolved.
	 */
	resolveAssetPath(assetPath: string, notePath: string): Promise<string | null>;

	// State
	saveSyncState(state: SyncState): Promise<void>;

	// UI callbacks (can be mocked as no-op in tests)
	onProgress(progress: Progress): void;
	onConflict(conflicts: ConflictInfo[]): Promise<ConflictResolution[]>;
	onAssetConflict(conflicts: AssetConflictInfo[]): Promise<AssetConflictResolution[]>;
	onServerDeleted(paths: string[]): Promise<boolean>;
	confirmPush(paths: string[]): Promise<boolean>;
}
