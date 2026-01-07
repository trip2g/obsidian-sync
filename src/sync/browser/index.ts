/**
 * Browser implementation of SyncEnv using File System Access API.
 * Uses browser-fs-access for cross-browser compatibility.
 */

import { directoryOpen, fileSave } from "browser-fs-access";
import { isAlwaysPublishable } from "../utils";
import type {
	SyncEnv,
	SyncState,
	LocalFile,
	ServerHash,
	NoteUpdate,
	PushedNote,
	NoteContent,
	NoteAssetInfo,
	UploadAssetParams,
	ConflictInfo,
	ConflictResolution,
	AssetConflictInfo,
	AssetConflictResolution,
	Progress,
	FilterOptions,
	SyncPlan,
	SyncResult,
} from "../types";
import { classifySync } from "../classify";
import { filterPlan } from "../filter";
import { executePlan } from "../execute";
import {
	saveDirectoryHandle,
	loadDirectoryHandle,
	clearDirectoryHandle,
	requestPermission,
	checkPermission,
	saveSyncState as saveStateToIDB,
	loadSyncState as loadStateFromIDB,
	clearSyncState,
} from "./storage";

// ============ Types ============

export interface BrowserEnvOptions {
	apiUrl: string;
	apiKey: string;
	twoWaySync?: boolean;
	publishField?: string;
}

export interface UICallbacks {
	onProgress?: (progress: Progress) => void;
	onConflict?: (conflicts: ConflictInfo[]) => Promise<ConflictResolution[]>;
	onAssetConflict?: (conflicts: AssetConflictInfo[]) => Promise<AssetConflictResolution[]>;
	onServerDeleted?: (paths: string[]) => Promise<boolean>;
	confirmPush?: (paths: string[]) => Promise<boolean>;
	onLog?: (message: string, level: "info" | "warn" | "error") => void;
}

// ============ BrowserEnv ============

export class BrowserEnv implements SyncEnv {
	private directoryHandle: FileSystemDirectoryHandle | null = null;
	private syncState: SyncState = { files: {} };
	private options: BrowserEnvOptions;
	private callbacks: UICallbacks;
	private fileCache: Map<string, FileSystemFileHandle> = new Map();
	private existsCache: Map<string, boolean> = new Map();

	pushBatchSize = 100;

	constructor(options: BrowserEnvOptions, callbacks: UICallbacks = {}) {
		this.options = options;
		this.callbacks = callbacks;
	}

	private log(message: string, level: "info" | "warn" | "error" = "info"): void {
		this.callbacks.onLog?.(message, level);
	}

	// ============ Directory Management ============

	/**
	 * Check if a directory is already saved in IndexedDB and has permission.
	 */
	async hasStoredDirectory(): Promise<boolean> {
		const handle = await loadDirectoryHandle();
		if (!handle) return false;

		const hasPermission = await checkPermission(handle);
		if (hasPermission) {
			this.directoryHandle = handle;
			return true;
		}
		return false;
	}

	/**
	 * Request permission for the stored directory handle.
	 * Must be called on user gesture (button click).
	 */
	async requestStoredPermission(): Promise<boolean> {
		const handle = await loadDirectoryHandle();
		if (!handle) return false;

		const granted = await requestPermission(handle);
		if (granted) {
			this.directoryHandle = handle;
		}
		return granted;
	}

	/**
	 * Open a directory picker and store the handle.
	 * Must be called on user gesture (button click).
	 */
	async selectDirectory(): Promise<boolean> {
		try {
			const blobs = await directoryOpen({
				recursive: true,
				mode: "readwrite",
			});

			// browser-fs-access returns blobs with directoryHandle on first item
			if (blobs.length > 0 && blobs[0].directoryHandle) {
				this.directoryHandle = blobs[0].directoryHandle;
				await saveDirectoryHandle(this.directoryHandle);
				this.log(`Directory selected: ${this.directoryHandle.name}`);
				return true;
			}

			return false;
		} catch (e) {
			if ((e as Error).name === "AbortError") {
				// User cancelled
				return false;
			}
			throw e;
		}
	}

	/**
	 * Clear stored directory handle and sync state.
	 */
	async clearDirectory(): Promise<void> {
		this.directoryHandle = null;
		this.fileCache.clear();
		this.existsCache.clear();
		await clearDirectoryHandle();
		await clearSyncState();
	}

	/**
	 * Get the name of the current directory.
	 */
	getDirectoryName(): string | null {
		return this.directoryHandle?.name ?? null;
	}

	/**
	 * Check if directory is selected and ready.
	 */
	isReady(): boolean {
		return this.directoryHandle !== null;
	}

	// ============ Sync Operations ============

	/**
	 * Initialize the environment (load sync state).
	 */
	async init(): Promise<void> {
		this.syncState = await loadStateFromIDB();

		// Try to restore directory handle
		const hasDir = await this.hasStoredDirectory();
		if (!hasDir) {
			this.log("No stored directory or permission lost", "warn");
		}
	}

	/**
	 * Run full sync operation.
	 */
	async sync(): Promise<SyncResult> {
		if (!this.directoryHandle) {
			throw new Error("No directory selected. Call selectDirectory() first.");
		}

		// Clear caches before sync
		this.fileCache.clear();
		this.existsCache.clear();

		// 1. Classify
		this.onProgress({ step: "classify", current: 0, total: 1 });
		const plan = await classifySync(this);

		// 2. Filter
		const filterOptions: FilterOptions = {
			twoWaySync: this.options.twoWaySync ?? false,
			hasPublishFields: this.options.publishField
				? (path) => this.hasPublishFieldSync(path)
				: undefined,
		};
		const filteredPlan = filterPlan(plan, filterOptions);

		// 3. Execute
		const result = await executePlan(this, filteredPlan);

		return result;
	}

	/**
	 * Get sync plan without executing (for preview).
	 */
	async getSyncPlan(): Promise<SyncPlan> {
		if (!this.directoryHandle) {
			throw new Error("No directory selected. Call selectDirectory() first.");
		}

		this.fileCache.clear();
		this.existsCache.clear();

		const plan = await classifySync(this);

		const filterOptions: FilterOptions = {
			twoWaySync: this.options.twoWaySync ?? false,
			hasPublishFields: this.options.publishField
				? (path) => this.hasPublishFieldSync(path)
				: undefined,
		};

		return filterPlan(plan, filterOptions);
	}

	// ============ ClassifyEnv Implementation ============

	async getLocalFiles(): Promise<LocalFile[]> {
		if (!this.directoryHandle) {
			throw new Error("No directory selected");
		}

		const files: LocalFile[] = [];
		await this.walkDirectory(this.directoryHandle, "", files);
		return files;
	}

	private async walkDirectory(
		dir: FileSystemDirectoryHandle,
		basePath: string,
		files: LocalFile[]
	): Promise<void> {
		for await (const [name, handle] of dir.entries()) {
			// Skip hidden files/dirs
			if (name.startsWith(".")) continue;

			const path = basePath ? `${basePath}/${name}` : name;

			if (handle.kind === "directory") {
				await this.walkDirectory(handle, path, files);
			} else if (handle.kind === "file") {
				const ext = name.split(".").pop()?.toLowerCase();
				if (ext === "md" || ext === "html") {
					const file = await handle.getFile();
					files.push({
						path,
						mtime: file.lastModified,
					});
					// Cache the handle for later use
					this.fileCache.set(path, handle);
				}
			}
		}
	}

	async getServerHashes(): Promise<ServerHash[]> {
		const query = `query FetchServerHashes {
			notePaths {
				path: value
				hash: latestContentHash
			}
		}`;

		const result = await this.graphqlRequest<{
			notePaths: Array<{ path: string; hash: string }>;
		}>(query);

		return result.notePaths.map((np) => ({
			path: np.path,
			hash: np.hash,
		}));
	}

	getSyncState(): SyncState {
		return this.syncState;
	}

	async computeHash(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		return this.arrayBufferToBase64Url(hashBuffer);
	}

	async readFileContent(path: string): Promise<string> {
		const handle = await this.getFileHandle(path);
		const file = await handle.getFile();
		return file.text();
	}

	// ============ File Operations ============

	async writeFile(path: string, content: string): Promise<void> {
		const handle = await this.getOrCreateFileHandle(path);
		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
	}

	async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
		const handle = await this.getOrCreateFileHandle(path);
		const writable = await handle.createWritable();
		await writable.write(data);
		await writable.close();
	}

	async readBinaryFile(path: string): Promise<ArrayBuffer> {
		const handle = await this.getFileHandle(path);
		const file = await handle.getFile();
		return file.arrayBuffer();
	}

	async deleteFile(path: string): Promise<void> {
		const parts = path.split("/");
		const fileName = parts.pop()!;
		const dir = await this.navigateToDir(parts.join("/"), false);
		if (dir) {
			await dir.removeEntry(fileName);
			this.fileCache.delete(path);
			this.existsCache.delete(path);
		}
	}

	async createFolder(path: string): Promise<void> {
		await this.navigateToDir(path, true);
	}

	async fileExists(path: string): Promise<boolean> {
		return this.fileExistsSync(path);
	}

	fileExistsSync(path: string): boolean {
		// Check cache first
		if (this.existsCache.has(path)) {
			return this.existsCache.get(path)!;
		}

		// This is a sync check - we can't actually do async file checks synchronously
		// So we rely on the cache being populated during walkDirectory
		const exists = this.fileCache.has(path);
		this.existsCache.set(path, exists);
		return exists;
	}

	// ============ Server Operations ============

	async pushNotes(updates: NoteUpdate[], skipCommit: boolean): Promise<PushedNote[]> {
		if (updates.length === 0) return [];

		// Defense in depth: verify all notes have publish field if configured
		if (this.options.publishField) {
			for (const update of updates) {
				if (!this.hasPublishFieldInContent(update.content, update.path)) {
					throw new Error(
						`[Security] Attempted to push note "${update.path}" without publish field "${this.options.publishField}". ` +
							`This is a bug in the sync logic - please report it.`
					);
				}
			}
		}

		const query = `mutation PushNotes($input: PushNotesInput!) {
			pushNotes(input: $input) {
				... on ErrorPayload {
					__typename
					message
				}
				... on PushNotesPayload {
					__typename
					notes {
						id
						path
						assets {
							path
							sha256Hash
							absolutePath
							url
						}
					}
				}
			}
		}`;

		const result = await this.graphqlRequest<{
			pushNotes:
				| { __typename: "ErrorPayload"; message: string }
				| {
						__typename: "PushNotesPayload";
						notes: Array<{
							id: number;
							path: string;
							assets: Array<{
								path: string;
								sha256Hash: string | null;
								absolutePath: string | null;
								url: string | null;
							}>;
						}>;
				  };
		}>(query, {
			input: {
				updates: updates.map((u) => ({ path: u.path, content: u.content })),
				skipCommit,
			},
		});

		if (result.pushNotes.__typename === "ErrorPayload") {
			throw new Error(`Push failed: ${result.pushNotes.message}`);
		}

		this.log(`Pushed ${updates.length} notes`);

		return result.pushNotes.notes.map((n) => ({
			id: String(n.id),
			path: n.path,
			assets: n.assets.map((a) => ({
				path: a.path,
				sha256Hash: a.sha256Hash,
				absolutePath: a.absolutePath,
				url: a.url,
			})),
		}));
	}

	async hideNotes(paths: string[]): Promise<void> {
		if (paths.length === 0) return;

		const query = `mutation HideNotes($input: HideNotesInput!) {
			hideNotes(input: $input) {
				... on ErrorPayload {
					__typename
					message
				}
				... on HideNotesPayload {
					__typename
					success
				}
			}
		}`;

		const result = await this.graphqlRequest<{
			hideNotes:
				| { __typename: "ErrorPayload"; message: string }
				| { __typename: "HideNotesPayload"; success: boolean };
		}>(query, { input: { paths } });

		if (result.hideNotes.__typename === "ErrorPayload") {
			throw new Error(`Hide failed: ${result.hideNotes.message}`);
		}

		this.log(`Hidden ${paths.length} notes`);
	}

	async fetchNoteContents(paths: string[]): Promise<NoteContent[]> {
		if (paths.length === 0) return [];

		const query = `query FetchNoteContents($filter: NotePathsFilter) {
			notePaths(filter: $filter) {
				path: value
				content: latestContent
			}
		}`;

		const result = await this.graphqlRequest<{
			notePaths: Array<{ path: string; content: string }>;
		}>(query, { filter: { paths } });

		return result.notePaths.map((np) => ({
			path: np.path,
			content: np.content,
		}));
	}

	async fetchNoteAssets(paths: string[]): Promise<NoteAssetInfo[]> {
		if (paths.length === 0) return [];

		// Use pushNotes with empty updates to get asset list from markdown parsing
		const query = `mutation FetchNoteAssets($input: PushNotesInput!) {
			pushNotes(input: $input) {
				... on ErrorPayload {
					__typename
					message
				}
				... on PushNotesPayload {
					__typename
					notes {
						id
						path
						assets {
							path
							sha256Hash
							absolutePath
							url
						}
					}
				}
			}
		}`;

		const result = await this.graphqlRequest<{
			pushNotes:
				| { __typename: "ErrorPayload"; message: string }
				| {
						__typename: "PushNotesPayload";
						notes: Array<{
							id: number;
							path: string;
							assets: Array<{
								path: string;
								sha256Hash: string | null;
								absolutePath: string | null;
								url: string | null;
							}>;
						}>;
				  };
		}>(query, { input: { updates: [] } });

		if (result.pushNotes.__typename === "ErrorPayload") {
			this.log(`Failed to fetch note assets: ${result.pushNotes.message}`, "error");
			return [];
		}

		const pathSet = new Set(paths);
		return result.pushNotes.notes
			.filter((note) => pathSet.has(note.path))
			.map((note) => ({
				path: note.path,
				noteId: String(note.id),
				assets: note.assets.map((a) => ({
					id: a.path,
					url: a.url ?? "",
					hash: a.sha256Hash ?? "",
					absolutePath: a.absolutePath ?? "",
				})),
			}));
	}

	async uploadAsset(params: UploadAssetParams): Promise<boolean> {
		const query = `mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
			uploadNoteAsset(input: $input) {
				... on ErrorPayload {
					__typename
					message
				}
				... on UploadNoteAssetPayload {
					__typename
					uploadSkipped
				}
			}
		}`;

		const operations = JSON.stringify({
			query,
			variables: {
				input: {
					file: null,
					noteId: parseInt(params.noteId),
					sha256Hash: params.sha256Hash,
					path: params.relativePath,
					absolutePath: params.absolutePath,
				},
			},
		});

		const map = JSON.stringify({
			"0": ["variables.input.file"],
		});

		const formData = new FormData();
		formData.append("operations", operations);
		formData.append("map", map);
		formData.append("0", params.blob, params.fileName);

		const response = await fetch(this.options.apiUrl, {
			method: "POST",
			headers: {
				"X-API-Key": this.options.apiKey,
			},
			body: formData,
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`HTTP ${response.status}: ${response.statusText}\n${body}`);
		}

		const result = await response.json();

		if (result.errors) {
			throw new Error(result.errors[0]?.message || "Unknown GraphQL error");
		}

		const payload = result.data?.uploadNoteAsset;
		if (payload?.__typename === "ErrorPayload") {
			throw new Error(`Upload failed: ${payload.message}`);
		}

		if (payload?.uploadSkipped) {
			this.log(`Asset skipped (already exists): ${params.relativePath}`);
		} else {
			this.log(`Asset uploaded: ${params.relativePath}`);
		}

		return true;
	}

	async downloadAsset(url: string): Promise<ArrayBuffer | null> {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				this.log(`Failed to download asset: HTTP ${response.status}`, "error");
				return null;
			}
			return response.arrayBuffer();
		} catch (e) {
			this.log(`Failed to download asset from ${url}: ${e}`, "error");
			return null;
		}
	}

	async commitNotes(): Promise<void> {
		const query = `mutation CommitNotes {
			commitNotes {
				... on ErrorPayload {
					__typename
					message
				}
				... on CommitNotesPayload {
					__typename
					success
				}
			}
		}`;

		const result = await this.graphqlRequest<{
			commitNotes:
				| { __typename: "ErrorPayload"; message: string }
				| { __typename: "CommitNotesPayload"; success: boolean };
		}>(query);

		if (result.commitNotes.__typename === "ErrorPayload") {
			throw new Error(`Commit failed: ${result.commitNotes.message}`);
		}

		this.log("Notes committed");
	}

	// ============ Asset Operations ============

	async computeBinaryHash(data: ArrayBuffer): Promise<string> {
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		// Return hex format (server expects hex for asset hash validation)
		return this.arrayBufferToHex(hashBuffer);
	}

	async resolveAssetPath(assetPath: string, notePath: string): Promise<string | null> {
		// Handle explicit paths
		if (assetPath.startsWith("./")) {
			const noteDir = this.dirname(notePath);
			const relativePath = this.joinPath(noteDir, assetPath.slice(2));
			if (await this.fileExistsAsync(relativePath)) {
				return relativePath;
			}
			return null;
		}

		if (assetPath.startsWith("/")) {
			const absolutePath = assetPath.slice(1);
			if (await this.fileExistsAsync(absolutePath)) {
				return absolutePath;
			}
			return null;
		}

		if (assetPath.includes("/")) {
			if (await this.fileExistsAsync(assetPath)) {
				return assetPath;
			}
			return null;
		}

		// Global resolution: root > assets > relative
		if (await this.fileExistsAsync(assetPath)) {
			return assetPath;
		}

		const assetsPath = `assets/${assetPath}`;
		if (await this.fileExistsAsync(assetsPath)) {
			return assetsPath;
		}

		const noteDir = this.dirname(notePath);
		if (noteDir && noteDir !== ".") {
			const relativePath = this.joinPath(noteDir, assetPath);
			if (await this.fileExistsAsync(relativePath)) {
				return relativePath;
			}
		}

		return null;
	}

	// ============ State ============

	async saveSyncState(state: SyncState): Promise<void> {
		state.lastSyncedAt = Date.now();
		await saveStateToIDB(state);
		this.syncState = state;
	}

	// ============ UI Callbacks ============

	onProgress(progress: Progress): void {
		this.callbacks.onProgress?.(progress);
	}

	async onConflict(conflicts: ConflictInfo[]): Promise<ConflictResolution[]> {
		if (this.callbacks.onConflict) {
			return this.callbacks.onConflict(conflicts);
		}
		// Default: keep local
		return conflicts.map(() => "keep_local");
	}

	async onAssetConflict(conflicts: AssetConflictInfo[]): Promise<AssetConflictResolution[]> {
		if (this.callbacks.onAssetConflict) {
			return this.callbacks.onAssetConflict(conflicts);
		}
		// Default: keep local
		return conflicts.map(() => "keep_local");
	}

	async onServerDeleted(paths: string[]): Promise<boolean> {
		if (this.callbacks.onServerDeleted) {
			return this.callbacks.onServerDeleted(paths);
		}
		// Default: keep local files
		return false;
	}

	async confirmPush(paths: string[]): Promise<boolean> {
		if (this.callbacks.confirmPush) {
			return this.callbacks.confirmPush(paths);
		}
		// Default: auto-confirm
		return true;
	}

	// ============ Private Helpers ============

	private async graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		const response = await fetch(this.options.apiUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": this.options.apiKey,
			},
			body: JSON.stringify({ query, variables }),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const json = (await response.json()) as {
			data?: T;
			errors?: Array<{ message: string }>;
		};

		if (json.errors?.length) {
			throw new Error(`GraphQL Error: ${json.errors[0].message}`);
		}

		if (!json.data) {
			throw new Error("GraphQL response missing data");
		}

		return json.data;
	}

	private async getFileHandle(path: string): Promise<FileSystemFileHandle> {
		// Check cache
		const cached = this.fileCache.get(path);
		if (cached) return cached;

		// Navigate to file
		const parts = path.split("/");
		const fileName = parts.pop()!;
		const dir = await this.navigateToDir(parts.join("/"), false);

		if (!dir) {
			throw new Error(`Directory not found for: ${path}`);
		}

		const handle = await dir.getFileHandle(fileName);
		this.fileCache.set(path, handle);
		return handle;
	}

	private async getOrCreateFileHandle(path: string): Promise<FileSystemFileHandle> {
		const parts = path.split("/");
		const fileName = parts.pop()!;
		const dir = await this.navigateToDir(parts.join("/"), true);

		if (!dir) {
			throw new Error(`Could not create directory for: ${path}`);
		}

		const handle = await dir.getFileHandle(fileName, { create: true });
		this.fileCache.set(path, handle);
		return handle;
	}

	private async navigateToDir(
		path: string,
		create: boolean
	): Promise<FileSystemDirectoryHandle | null> {
		if (!this.directoryHandle) return null;
		if (!path || path === ".") return this.directoryHandle;

		let current = this.directoryHandle;
		const parts = path.split("/").filter((p) => p && p !== ".");

		for (const part of parts) {
			try {
				current = await current.getDirectoryHandle(part, { create });
			} catch {
				if (create) throw new Error(`Could not create directory: ${part}`);
				return null;
			}
		}

		return current;
	}

	private async fileExistsAsync(path: string): Promise<boolean> {
		if (this.existsCache.has(path)) {
			return this.existsCache.get(path)!;
		}

		try {
			await this.getFileHandle(path);
			this.existsCache.set(path, true);
			return true;
		} catch {
			this.existsCache.set(path, false);
			return false;
		}
	}

	private arrayBufferToBase64Url(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		const base64 = btoa(binary);
		return base64.replace(/\+/g, "-").replace(/\//g, "_");
	}

	private arrayBufferToHex(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let hex = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			hex += bytes[i].toString(16).padStart(2, "0");
		}
		return hex;
	}

	private dirname(path: string): string {
		const lastSlash = path.lastIndexOf("/");
		if (lastSlash === -1) return "";
		return path.slice(0, lastSlash);
	}

	private joinPath(...parts: string[]): string {
		return parts.filter((p) => p).join("/");
	}

	private hasPublishFieldSync(path: string): boolean {
		// This is called during filterPlan which is sync
		// We need to read the file content to check
		// For now, return true and let defense-in-depth catch it
		return true;
	}

	private hasPublishFieldInContent(content: string, path: string): boolean {
		if (!this.options.publishField) return true;

		// Check if file is always publishable (e.g., _layouts/*.html)
		if (isAlwaysPublishable(path)) return true;

		if (!content.startsWith("---")) return false;
		const endIndex = content.indexOf("\n---", 3);
		if (endIndex === -1) return false;

		const frontmatterText = content.slice(4, endIndex);
		const fields = this.options.publishField
			.split(",")
			.map((f) => f.trim())
			.filter((f) => f);

		for (const field of fields) {
			const regex = new RegExp(`^${field}\\s*:\\s*(.+)$`, "m");
			const match = frontmatterText.match(regex);
			if (match) {
				const value = match[1].trim().toLowerCase();
				if (
					value === "true" ||
					value === "yes" ||
					value === "1" ||
					value === '"true"' ||
					value === "'true'"
				) {
					return true;
				}
			}
		}

		return false;
	}
}

// ============ Exports ============

// Re-export types for convenience
export type {
	SyncState,
	SyncPlan,
	SyncResult,
	Progress,
	ConflictInfo,
	ConflictResolution,
	AssetConflictInfo,
	AssetConflictResolution,
	FilterOptions,
} from "../types";

// Re-export storage functions for direct access
export {
	configureStorage,
	saveDirectoryHandle,
	loadDirectoryHandle,
	clearDirectoryHandle,
	requestPermission,
	checkPermission,
	saveSyncState,
	loadSyncState,
	clearSyncState,
} from "./storage";

export type { StorageConfig } from "./storage";

// Re-export sync functions for advanced usage
export { classifySync } from "../classify";
export { filterPlan } from "../filter";
export { executePlan } from "../execute";
