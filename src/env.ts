/**
 * Obsidian implementation of SyncEnv.
 * Adapter between Obsidian APIs and platform-agnostic sync logic.
 */

import { App, TFile, TFolder, requestUrl } from "obsidian";
import type { Sdk } from "./graphql";
import { isAlwaysPublishable } from "./sync/utils";
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
} from "./sync/types";

export interface ObsidianEnvOptions {
	app: App;
	sdk: Sdk;
	folder: TFolder;
	syncState: SyncState;
	apiUrl: string;
	apiKey: string;
	pluginVersion: string;
	publishField?: string;
	twoWaySync: boolean;
	// Callbacks for UI interactions
	onProgressCallback: (progress: Progress) => void;
	onConflictCallback: (conflicts: ConflictInfo[]) => Promise<ConflictResolution[]>;
	onAssetConflictCallback: (conflicts: AssetConflictInfo[]) => Promise<AssetConflictResolution[]>;
	onServerDeletedCallback: (paths: string[]) => Promise<boolean>;
	confirmPushCallback: (paths: string[]) => Promise<boolean>;
	saveSyncStateCallback: (state: SyncState) => Promise<void>;
}

function normalizeApiUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

export class ObsidianSyncEnv implements SyncEnv {
	private app: App;
	private sdk: Sdk;
	private folder: TFolder;
	private syncState: SyncState;
	private apiUrl: string;
	private apiKey: string;
	private pluginVersion: string;
	private publishField: string;
	private twoWaySync: boolean;
	private onProgressCallback: (progress: Progress) => void;
	private onConflictCallback: (conflicts: ConflictInfo[]) => Promise<ConflictResolution[]>;
	private onAssetConflictCallback: (conflicts: AssetConflictInfo[]) => Promise<AssetConflictResolution[]>;
	private onServerDeletedCallback: (paths: string[]) => Promise<boolean>;
	private confirmPushCallback: (paths: string[]) => Promise<boolean>;
	private saveSyncStateCallback: (state: SyncState) => Promise<void>;

	pushBatchSize = 100;

	constructor(options: ObsidianEnvOptions) {
		this.app = options.app;
		this.sdk = options.sdk;
		this.folder = options.folder;
		this.syncState = options.syncState;
		this.apiUrl = normalizeApiUrl(options.apiUrl);
		this.apiKey = options.apiKey;
		this.pluginVersion = options.pluginVersion;
		this.publishField = options.publishField || "";
		this.twoWaySync = options.twoWaySync;
		this.onProgressCallback = options.onProgressCallback;
		this.onConflictCallback = options.onConflictCallback;
		this.onAssetConflictCallback = options.onAssetConflictCallback;
		this.onServerDeletedCallback = options.onServerDeletedCallback;
		this.confirmPushCallback = options.confirmPushCallback;
		this.saveSyncStateCallback = options.saveSyncStateCallback;
	}

	private assertTwoWaySync(operation: string): void {
		if (!this.twoWaySync) {
			throw new Error(`[Bug] ${operation} called with twoWaySync disabled`);
		}
	}

	// ============ ClassifyEnv ============

	async getLocalFiles(): Promise<LocalFile[]> {
		const files = this.getAllMarkdownFiles(this.folder);
		return files.map((file) => ({
			path: this.getRelativePath(file),
			mtime: file.stat.mtime,
		}));
	}

	async getServerHashes(): Promise<ServerHash[]> {
		const data = await this.sdk.FetchServerHashes();
		return data.notePaths
			.filter((item) => item.path && item.hash)
			.map((item) => ({
				path: item.path,
				hash: item.hash,
			}));
	}

	getSyncState(): SyncState {
		return this.syncState;
	}

	async computeHash(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = new Uint8Array(hashBuffer);
		return btoa(String.fromCharCode(...hashArray))
			.replace(/\+/g, "-")
			.replace(/\//g, "_");
	}

	async readFileContent(path: string): Promise<string> {
		const fullPath = this.getFullPath(path);
		const file = this.app.vault.getAbstractFileByPath(fullPath);
		if (!(file instanceof TFile)) {
			throw new Error(`File not found: ${path}`);
		}
		return this.app.vault.read(file);
	}

	// ============ File Operations ============

	async writeFile(path: string, content: string): Promise<void> {
		this.assertTwoWaySync("writeFile");
		const fullPath = this.getFullPath(path);
		const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
		} else {
			await this.app.vault.create(fullPath, content);
		}
	}

	async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
		this.assertTwoWaySync("writeBinaryFile");
		const fullPath = this.getFullPath(path);
		const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modifyBinary(existingFile, data);
		} else {
			await this.app.vault.createBinary(fullPath, data);
		}
	}

	async readBinaryFile(path: string): Promise<ArrayBuffer> {
		const fullPath = this.getFullPath(path);
		const file = this.app.vault.getAbstractFileByPath(fullPath);
		if (!(file instanceof TFile)) {
			throw new Error(`File not found: ${path}`);
		}
		return this.app.vault.readBinary(file);
	}

	async deleteFile(path: string): Promise<void> {
		this.assertTwoWaySync("deleteFile");
		const fullPath = this.getFullPath(path);
		const file = this.app.vault.getAbstractFileByPath(fullPath);
		if (file instanceof TFile) {
			await this.app.fileManager.trashFile(file);
		}
	}

	async createFolder(folderPath: string): Promise<void> {
		this.assertTwoWaySync("createFolder");
		const fullPath = this.getFullPath(folderPath);
		if (!this.app.vault.getAbstractFileByPath(fullPath)) {
			await this.app.vault.createFolder(fullPath);
		}
	}

	async fileExists(path: string): Promise<boolean> {
		const fullPath = this.getFullPath(path);
		return this.app.vault.getAbstractFileByPath(fullPath) instanceof TFile;
	}

	// ============ Server Operations ============

	async pushNotes(updates: NoteUpdate[], skipCommit: boolean): Promise<PushedNote[]> {
		if (updates.length === 0) {
			return [];
		}

		// Defense in depth: verify all notes have publish field if configured
		if (this.publishField) {
			for (const update of updates) {
				if (!this.hasPublishFieldInContent(update.content, update.path)) {
					throw new Error(
						`[Security] Attempted to push note "${update.path}" without publish field "${this.publishField}". ` +
							`This is a bug in the sync logic - please report it.`
					);
				}
			}
		}

		const result = await this.sdk.PushNotes({
			input: {
				updates: updates.map((u) => ({ path: u.path, content: u.content })),
				skipCommit,
			},
		});

		if ("message" in result.pushNotes) {
			throw new Error(`Push failed: ${result.pushNotes.message}`);
		}

		return result.pushNotes.notes.map((n) => ({
			id: String(n.id),
			path: n.path,
			assets: n.assets.map((a) => ({
				path: a.path,
				sha256Hash: a.sha256Hash ?? null,
				absolutePath: a.absolutePath ?? null,
				url: a.url ?? null,
			})),
		}));
	}

	async hideNotes(paths: string[]): Promise<void> {
		if (paths.length === 0) {
			return;
		}

		const result = await this.sdk.HideNotes({ input: { paths } });
		if ("message" in result.hideNotes) {
			throw new Error(`Hide failed: ${result.hideNotes.message}`);
		}
	}

	async fetchNoteContents(paths: string[]): Promise<NoteContent[]> {
		if (paths.length === 0) {
			return [];
		}

		const result = await this.sdk.FetchNoteContents({ filter: { paths } });
		return result.notePaths.map((np) => ({
			path: np.path,
			content: np.content,
		}));
	}

	async fetchNoteAssets(paths: string[]): Promise<NoteAssetInfo[]> {
		if (paths.length === 0) {
			return [];
		}

		// Use pushNotes with empty updates to get complete asset list from markdown parsing
		// This returns assets from note.Assets (parsed from markdown) not just note_version_assets (DB)
		const result = await this.sdk.PushNotes({ input: { updates: [] } });

		if ("message" in result.pushNotes) {
			console.error(`[Trip2g Sync] Failed to fetch note assets: ${result.pushNotes.message}`);
			return [];
		}

		const pathSet = new Set(paths);
		return result.pushNotes.notes
			.filter((note) => pathSet.has(note.path))
			.map((note) => ({
				path: note.path,
				noteId: String(note.id), // version ID for upload
				assets: note.assets.map((a) => ({
					id: a.path, // relative path used as asset identifier
					url: a.url,
					hash: a.sha256Hash ?? "", // empty string for null (not uploaded)
					absolutePath: a.absolutePath,
				})),
			}));
	}

	async uploadAsset(params: UploadAssetParams): Promise<boolean> {
		const maxRetries = 10;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const success = await this.uploadAssetOnce(params);
				if (success) {
					return true;
				}
			} catch (e) {
				console.error(`[Trip2g Sync] Upload attempt ${attempt} failed for ${params.relativePath}:`, e);
				if (attempt < maxRetries) {
					const delay = Math.pow(2, attempt - 1) * 1000;
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}
		return false;
	}

	private async uploadAssetOnce(params: UploadAssetParams): Promise<boolean> {
		const operations = JSON.stringify({
			variables: {
				input: {
					skipCommit: true,
					file: null,
					noteId: params.noteId,
					sha256Hash: params.sha256Hash,
					path: params.relativePath,
					absolutePath: params.absolutePath,
				},
			},
			query: `mutation($input: UploadNoteAssetInput!) {
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
			}`,
		});

		const map = JSON.stringify({ "0": ["variables.input.file"] });

		const formData = new FormData();
		formData.append("operations", operations);
		formData.append("map", map);
		formData.append("0", params.blob, params.fileName);

		const response = await fetch(`${this.apiUrl}/graphql`, {
			method: "POST",
			headers: {
				"X-API-Key": this.apiKey,
				"X-Plugin-Version": this.pluginVersion,
			},
			body: formData,
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = (await response.json()) as {
			errors?: Array<{ message: string }>;
			data?: {
				uploadNoteAsset?: {
					__typename: string;
					message?: string;
				};
			};
		};
		if (result.errors) {
			throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
		}

		const payload = result.data?.uploadNoteAsset;
		if (payload?.__typename === "ErrorPayload") {
			throw new Error(`Upload failed: ${payload.message}`);
		}

		return true;
	}

	async downloadAsset(url: string): Promise<ArrayBuffer | null> {
		try {
			const response = await requestUrl({ url });
			if (response.status >= 400) {
				console.error(`[Trip2g Sync] HTTP ${response.status} downloading asset from ${url}`);
				return null;
			}
			return response.arrayBuffer;
		} catch (e) {
			console.error(`[Trip2g Sync] Failed to download asset from ${url}:`, e);
			return null;
		}
	}

	async commitNotes(): Promise<{ updated: Array<{ path: string; url: string; warnings: Array<{ level: string; message: string }> }> }> {
		const result = await this.sdk.CommitNotes();
		if ("message" in result.commitNotes) {
			throw new Error(`Commit failed: ${result.commitNotes.message}`);
		}
		return {
			updated: (result.commitNotes.updated ?? []).map((n) => ({
				path: n.path,
				url: n.url ?? "",
				warnings: (n.warnings ?? []).map((w) => ({ level: w.level, message: w.message })),
			})),
		};
	}

	// ============ Asset Operations ============

	async computeBinaryHash(data: ArrayBuffer): Promise<string> {
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = new Uint8Array(hashBuffer);
		return Array.from(hashArray)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	async resolveAssetPath(assetPath: string, notePath: string): Promise<string | null> {
		const noteFullPath = this.getFullPath(notePath);
		const noteFile = this.app.vault.getAbstractFileByPath(noteFullPath);
		if (!(noteFile instanceof TFile)) {
			return null;
		}

		const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(assetPath, noteFile.path);
		if (!(resolvedFile instanceof TFile)) {
			return null;
		}

		return this.getRelativePath(resolvedFile);
	}

	// ============ State ============

	async saveSyncState(state: SyncState): Promise<void> {
		await this.saveSyncStateCallback(state);
	}

	// ============ UI Callbacks ============

	onProgress(progress: Progress): void {
		this.onProgressCallback(progress);
	}

	async onConflict(conflicts: ConflictInfo[]): Promise<ConflictResolution[]> {
		return this.onConflictCallback(conflicts);
	}

	async onAssetConflict(conflicts: AssetConflictInfo[]): Promise<AssetConflictResolution[]> {
		return this.onAssetConflictCallback(conflicts);
	}

	async onServerDeleted(paths: string[]): Promise<boolean> {
		return this.onServerDeletedCallback(paths);
	}

	async confirmPush(paths: string[]): Promise<boolean> {
		return this.confirmPushCallback(paths);
	}

	// ============ Helper Methods ============

	private getFullPath(relativePath: string): string {
		if (this.folder.path === "/" || this.folder.path === "") {
			return relativePath;
		}
		return `${this.folder.path}/${relativePath}`;
	}

	private getRelativePath(file: TFile): string {
		const basePath = this.folder.path;
		const filePath = file.path;

		if (basePath === "/" || basePath === "") {
			return filePath;
		}

		if (filePath.startsWith(basePath + "/")) {
			return filePath.slice(basePath.length + 1);
		}

		return filePath;
	}

	private getAllMarkdownFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];

		for (const child of folder.children) {
			if (child instanceof TFile && (child.extension === "md" || child.extension === "html")) {
				if (!this.shouldExcludeFile(child.path)) {
					files.push(child);
				}
			} else if (child instanceof TFolder) {
				files.push(...this.getAllMarkdownFiles(child));
			}
		}

		return files;
	}

	private shouldExcludeFile(filePath: string): boolean {
		if (filePath.startsWith("_layouts/") && filePath.includes("/node_modules/")) {
			return true;
		}
		return false;
	}

	/**
	 * Check if content has any of the publish fields with a truthy value in frontmatter.
	 * Parses YAML frontmatter from the content string.
	 * 
	 * Special case: Files in special directories (e.g., _layouts/*.html) are always
	 * considered publishable because they are system files.
	 */
	private hasPublishFieldInContent(content: string, path: string): boolean {
		if (!this.publishField) return true;

		// Check if file is always publishable (e.g., _layouts/*.html)
		if (isAlwaysPublishable(path)) return true;

		// Extract frontmatter
		if (!content.startsWith("---")) return false;
		const endIndex = content.indexOf("\n---", 3);
		if (endIndex === -1) return false;

		const frontmatterText = content.slice(4, endIndex);
		const fields = this.publishField.split(",").map((f) => f.trim()).filter((f) => f);

		// Simple YAML parsing: look for "field: true" or "field: yes" patterns
		for (const field of fields) {
			// Match: field: true, field: yes, field: 1, field: "true", etc.
			const regex = new RegExp(`^${field}\\s*:\\s*(.+)$`, "m");
			const match = frontmatterText.match(regex);
			if (match) {
				const value = match[1].trim().toLowerCase();
				// Check for truthy YAML values
				if (value === "true" || value === "yes" || value === "1" || value === '"true"' || value === "'true'") {
					return true;
				}
			}
		}

		return false;
	}
}
