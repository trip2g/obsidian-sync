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
	errors: string[];
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

export interface SyncEnv extends ClassifyEnv {
	// File operations
	writeFile(path: string, content: string): Promise<void>;
	writeBinaryFile(path: string, data: ArrayBuffer): Promise<void>;
	readBinaryFile(path: string): Promise<ArrayBuffer>;
	deleteFile(path: string): Promise<void>;
	createFolder(path: string): Promise<void>;

	// Server operations
	pushNotes(updates: NoteUpdate[], skipCommit: boolean): Promise<PushedNote[]>;
	hideNotes(paths: string[]): Promise<void>;
	fetchNoteContents(paths: string[]): Promise<NoteContent[]>;
	uploadAsset(params: UploadAssetParams): Promise<boolean>;
	commitNotes(): Promise<void>;

	// State
	saveSyncState(state: SyncState): Promise<void>;

	// UI callbacks (can be mocked as no-op in tests)
	showProgress(message: string): void;
	onConflict(conflicts: ConflictInfo[]): Promise<ConflictResolution[]>;
	onServerDeleted(paths: string[]): Promise<boolean>;
	confirmPush(paths: string[]): Promise<boolean>;
}
