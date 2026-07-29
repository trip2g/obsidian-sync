/**
 * CLI implementation of SyncEnv using Node.js fs APIs.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { isAlwaysPublishable, sameOrigin, resolveAssetUrl } from "../utils";
import type {
	SyncEnv,
	SyncState,
	LocalFile,
	ServerHash,
	NoteUpdate,
	PushedNote,
	NoteContent,
	UploadAssetParams,
	ConflictInfo,
	ConflictResolution,
	AssetConflictInfo,
	AssetConflictResolution,
} from "../types";
import { resolveAssetPath } from "../resolve";
import { uploadWithRetry, AssetTooLargeError } from "../upload-retry";
import { createClient, type ClientOptions } from "./client";
import type { Sdk } from "../../graphql";

/** CLI conflict resolution strategy */
export type CliConflictResolution = "local" | "remote" | "skip" | "fail";

export interface NodeEnvOptions extends ClientOptions {
	folder: string;
	/** Remote path prefix for multi-repo setups (e.g., "docs" -> files uploaded as docs/file.md) */
	prefix?: string;
	twoWaySync: boolean;
	verbose?: boolean;
	conflictResolution?: CliConflictResolution;
	publishField?: string;
	/** Additional frontmatter fields to add/override on all pushed files */
	meta?: Record<string, string>;
	/**
	 * Override the sync-state file path.
	 * Absolute path: used as-is.
	 * Relative path: resolved relative to `folder`.
	 * Omit to use the default per-host name derived from `apiUrl`.
	 */
	stateFile?: string;
}

const LEGACY_STATE_FILE = ".sync-state.json";

/**
 * Derive a per-endpoint sync-state filename from an API URL.
 * Uses url.host (hostname + port) so that different servers never share a cache.
 * The host is sanitized to be safe in filenames: characters outside [a-zA-Z0-9.-] become '_'.
 * Falls back to the legacy ".sync-state.json" for empty or invalid URLs.
 *
 * Examples:
 *   "http://localhost:8081"         -> ".sync-state.localhost_8081.json"
 *   "http://localhost:8081/graphql" -> ".sync-state.localhost_8081.json"
 *   "https://trip2g.com/graphql"   -> ".sync-state.trip2g.com.json"
 */
export function stateFileNameForApiUrl(apiUrl: string): string {
	if (!apiUrl) return LEGACY_STATE_FILE;
	try {
		const url = new URL(apiUrl);
		const sanitized = url.host.replace(/[^a-zA-Z0-9.-]/g, "_");
		if (!sanitized) return LEGACY_STATE_FILE;
		return `.sync-state.${sanitized}.json`;
	} catch {
		return LEGACY_STATE_FILE;
	}
}

export class NodeEnv implements SyncEnv {
	private folder: string;
	private prefix: string;
	private twoWaySync: boolean;
	private verbose: boolean;
	private conflictResolution: CliConflictResolution;
	private publishField: string;
	private meta: Record<string, string>;
	/** Absolute path to the sync-state JSON file. */
	private statePath: string;
	private syncState: SyncState;
	private sdk: Sdk;
	private apiUrl: string;
	private apiKey: string;
	/** Every vault file, rebuilt on each getLocalFiles() walk. Used for global wikilink resolution. */
	private vaultFiles: string[] | null = null;

	pushBatchSize = 100;

	constructor(options: NodeEnvOptions) {
		this.folder = path.resolve(options.folder);
		this.prefix = options.prefix ? options.prefix.replace(/\/$/, "") : "";
		this.twoWaySync = options.twoWaySync;
		this.verbose = options.verbose ?? false;
		this.conflictResolution = options.conflictResolution ?? "local";
		this.publishField = options.publishField ?? "";
		this.meta = options.meta ?? {};
		// apiUrl and statePath must be set BEFORE loadSyncState() is called.
		this.apiUrl = options.apiUrl;
		this.apiKey = options.apiKey;
		if (options.stateFile) {
			this.statePath = path.isAbsolute(options.stateFile)
				? options.stateFile
				: path.join(this.folder, options.stateFile);
		} else {
			this.statePath = path.join(this.folder, stateFileNameForApiUrl(options.apiUrl));
		}
		this.syncState = this.loadSyncState();
		this.sdk = createClient({ apiUrl: options.apiUrl, apiKey: options.apiKey });
	}

	/** Add prefix to local path for remote path */
	private toRemotePath(localPath: string): string {
		return this.prefix ? `${this.prefix}/${localPath}` : localPath;
	}

	/** Remove prefix from remote path to get local path */
	private toLocalPath(remotePath: string): string {
		if (this.prefix && remotePath.startsWith(this.prefix + "/")) {
			return remotePath.substring(this.prefix.length + 1);
		}
		return remotePath;
	}

	/** Check if remote path belongs to this prefix */
	private matchesPrefix(remotePath: string): boolean {
		if (!this.prefix) return true;
		return remotePath.startsWith(this.prefix + "/");
	}

	private loadSyncState(): SyncState {
		try {
			if (fs.existsSync(this.statePath)) {
				const data = fs.readFileSync(this.statePath, "utf-8");
				return JSON.parse(data);
			}
		} catch (e) {
			this.log(`Warning: Could not load sync state: ${e}`);
		}
		return { files: {} };
	}

	private log(message: string): void {
		if (this.verbose) {
			console.log(message);
		}
	}

	// ============ ClassifyEnv ============

	async getLocalFiles(): Promise<LocalFile[]> {
		return this.walkVault().notes;
	}

	listVaultFiles(): string[] {
		// getLocalFiles() refreshes the cache at the start of every sync run;
		// walk on demand when an asset is resolved before that.
		return this.vaultFiles ?? this.walkVault().all;
	}

	/** Walk the vault once, collecting syncable notes and every file path. */
	private walkVault(): { notes: LocalFile[]; all: string[] } {
		const files: LocalFile[] = [];
		const vaultFiles: string[] = [];
		const walk = (dir: string) => {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				// Skip hidden files/dirs and node_modules
				if (entry.name.startsWith(".") || entry.name === "node_modules") {
					continue;
				}
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(fullPath);
				} else if (entry.isFile()) {
					const relPath = path.relative(this.folder, fullPath);
					vaultFiles.push(relPath.split(path.sep).join("/"));

					const ext = path.extname(entry.name).toLowerCase();
					if (ext === ".md" || ext === ".html" || ext === ".canvas" || ext === ".base" || ext === ".excalidraw" || entry.name.endsWith(".html.json")) {
						const stat = fs.statSync(fullPath);
						files.push({
							// Use remote path with prefix for sync comparison
							path: this.toRemotePath(relPath),
							mtime: stat.mtimeMs,
						});
					}
				}
			}
		};
		walk(this.folder);
		this.vaultFiles = vaultFiles;
		return { notes: files, all: vaultFiles };
	}

	async getServerHashes(): Promise<ServerHash[]> {
		try {
			const result = await this.sdk.FetchServerHashes();
			// Filter by prefix if set
			return result.notePaths
				.filter((np) => this.matchesPrefix(np.path))
				.map((np) => ({
					path: np.path,
					hash: np.hash,
				}));
		} catch (e) {
			console.error(`❌ Failed to fetch server hashes: ${e}`);
			return [];
		}
	}

	getSyncState(): SyncState {
		return this.syncState;
	}

	async computeHash(content: string): Promise<string> {
		const hash = crypto.createHash("sha256").update(content, "utf-8").digest();
		// URL-safe base64 with padding (same as Python's urlsafe_b64encode)
		// Node's base64url doesn't include padding, so we use base64 and replace chars
		const b64 = hash.toString("base64");
		return b64.replace(/\+/g, "-").replace(/\//g, "_");
	}

	async readFileContent(filePath: string): Promise<string> {
		// filePath is remote path, convert to local
		const localPath = this.toLocalPath(filePath);
		const fullPath = path.join(this.folder, localPath);
		return fs.readFileSync(fullPath, "utf-8");
	}

	// ============ File Operations ============

	async writeFile(filePath: string, content: string): Promise<void> {
		const fullPath = path.join(this.folder, filePath);
		fs.writeFileSync(fullPath, content, "utf-8");
	}

	async writeBinaryFile(filePath: string, data: ArrayBuffer): Promise<void> {
		const fullPath = path.join(this.folder, filePath);
		fs.writeFileSync(fullPath, Buffer.from(data));
	}

	async readBinaryFile(filePath: string): Promise<ArrayBuffer> {
		const fullPath = path.join(this.folder, filePath);
		const buffer = fs.readFileSync(fullPath);
		return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
	}

	async deleteFile(filePath: string): Promise<void> {
		const fullPath = path.join(this.folder, filePath);
		if (fs.existsSync(fullPath)) {
			fs.unlinkSync(fullPath);
		}
	}

	async createFolder(folderPath: string): Promise<void> {
		const fullPath = path.join(this.folder, folderPath);
		fs.mkdirSync(fullPath, { recursive: true });
	}

	async fileExists(filePath: string): Promise<boolean> {
		return this.fileExistsSync(filePath);
	}

	fileExistsSync(filePath: string): boolean {
		const fullPath = path.join(this.folder, filePath);
		return fs.existsSync(fullPath);
	}

	// ============ Server Operations ============

	async pushNotes(updates: NoteUpdate[], skipCommit: boolean): Promise<PushedNote[]> {
		if (updates.length === 0) {
			return [];
		}

		// Apply meta injection if configured
		const processedUpdates = updates.map((u) => ({
			path: u.path,
			content: this.injectMeta(u.content),
		}));

		// Defense in depth: verify all notes have publish field if configured
		if (this.publishField) {
			for (const update of processedUpdates) {
				if (!this.hasPublishFieldInContent(update.content, update.path)) {
					throw new Error(
						`[Security] Attempted to push note "${update.path}" without publish field "${this.publishField}". ` +
							`This is a bug in the sync logic - please report it.`
					);
				}
			}
		}

		try {
			const result = await this.sdk.PushNotes({
				input: {
					updates: processedUpdates.map((u) => ({
						path: u.path,
						content: u.content,
					})),
					skipCommit,
				},
			});

			if ("message" in result.pushNotes) {
				throw new Error(`Push failed: ${result.pushNotes.message}`);
			}

			console.log(`✅ Pushed ${updates.length} notes`);
			const urlMap = new Map(
				(result.pushNotes.updated ?? []).map((u) => [u.path, u.url ?? null])
			);
			return result.pushNotes.notes.map((n) => ({
				id: String(n.id),
				path: n.path,
				assets: n.assets.map((a) => ({
					path: a.path,
					sha256Hash: a.sha256Hash ?? null,
					absolutePath: a.absolutePath ?? null,
					url: a.url ?? null,
				})),
				url: urlMap.get(n.path) ?? null,
				warnings: n.warnings.map((w) => ({ level: w.level, message: w.message })),
			}));
		} catch (e) {
			const paths = processedUpdates.map((u) => u.path).join(", ");
			console.error(`❌ Failed to push notes (batch paths: ${paths}):`);
			console.error(e);
			// graphql-request ClientError exposes .response with status + errors.
			const anyE = e as { response?: unknown; request?: unknown };
			if (anyE.response) {
				console.error("   response:", JSON.stringify(anyE.response, null, 2));
			}
			if (anyE.request) {
				console.error("   request:", JSON.stringify(anyE.request, null, 2));
			}
			console.error("   own props:", Object.getOwnPropertyNames(e as object));
			return [];
		}
	}

	async hideNotes(paths: string[]): Promise<void> {
		if (paths.length === 0) {
			return;
		}

		try {
			const result = await this.sdk.HideNotes({
				input: { paths },
			});

			if ("message" in result.hideNotes) {
				throw new Error(`Hide failed: ${result.hideNotes.message}`);
			}

			console.log(`✅ Hidden ${paths.length} notes`);
		} catch (e) {
			console.error(`❌ Failed to hide notes: ${e}`);
		}
	}

	async fetchNoteContents(paths: string[]): Promise<NoteContent[]> {
		if (paths.length === 0) {
			return [];
		}

		try {
			const result = await this.sdk.FetchNoteContents({
				filter: { paths },
			});

			return result.notePaths.map((np) => ({
				path: np.path,
				content: np.content,
			}));
		} catch (e) {
			console.error(`❌ Failed to fetch note contents: ${e}`);
			return [];
		}
	}

	async fetchNoteAssets(paths: string[]): Promise<import("../types").NoteAssetInfo[]> {
		if (paths.length === 0) {
			return [];
		}

		try {
			// Use pushNotes with empty updates to get complete asset list from markdown parsing
			// This returns assets from note.Assets (parsed from markdown) not just note_version_assets (DB)
			const result = await this.sdk.PushNotes({
				input: { updates: [] },
			});

			if ("message" in result.pushNotes) {
				console.error(`❌ Failed to fetch note assets: ${result.pushNotes.message}`);
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
		} catch (e) {
			console.error(`❌ Failed to fetch note assets: ${e}`);
			return [];
		}
	}

	async uploadAsset(params: UploadAssetParams): Promise<boolean> {
		return uploadWithRetry(() => this.uploadAssetOnce(params), {
			// Preserve the CLI's original no-delay retry behavior.
			sleep: async () => {},
			onRetry: (attempt) => this.log(`⚠️ Upload attempt ${attempt} failed, retrying: ${params.relativePath}`),
			onGiveUp: (e) => console.error(`❌ Failed to upload asset ${params.relativePath}: ${e}`),
		});
	}

	private async uploadAssetOnce(params: UploadAssetParams): Promise<boolean> {
		// Use FormData multipart upload (graphql-request doesn't support file uploads)
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
					skipCommit: true, // batch: skip per-upload PrepareLatestNotes; executePlan commits once at the end
					file: null, // Will be replaced by multipart map
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

		const response = await fetch(this.apiUrl, {
			method: "POST",
			headers: {
				"X-API-Key": this.apiKey,
			},
			body: formData,
		});

		if (response.status === 413) {
			throw new AssetTooLargeError(params.fileName);
		}
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
			this.log(`⏩ Asset skipped (already exists): ${params.relativePath}`);
		} else {
			console.log(`✅ Asset uploaded: ${params.relativePath}`);
		}
		return true;
	}

	async downloadAsset(url: string): Promise<ArrayBuffer | null> {
		const resolvedUrl = resolveAssetUrl(this.apiUrl, url);
		try {
			const headers = sameOrigin(this.apiUrl, resolvedUrl) ? { "X-API-Key": this.apiKey } : undefined;
			const response = await fetch(resolvedUrl, { headers });
			if (!response.ok) {
				console.error(`❌ Failed to download asset: HTTP ${response.status}`);
				return null;
			}
			return await response.arrayBuffer();
		} catch (e) {
			console.error(`❌ Failed to download asset from ${resolvedUrl}: ${e}`);
			return null;
		}
	}

	async commitNotes(): Promise<{ updated: Array<{ path: string; url: string; warnings: Array<{ level: string; message: string }> }> }> {
		try {
			const result = await this.sdk.CommitNotes();

			if ("message" in result.commitNotes) {
				throw new Error(`Commit failed: ${result.commitNotes.message}`);
			}

			console.log("✅ Notes committed");
			return {
				updated: (result.commitNotes.updated ?? []).map((n) => ({
					path: n.path,
					url: n.url ?? "",
					warnings: (n.warnings ?? []).map((w) => ({ level: w.level, message: w.message })),
				})),
			};
		} catch (e) {
			console.error(`❌ Failed to commit notes: ${e}`);
			return { updated: [] };
		}
	}

	// ============ State ============

	async saveSyncState(state: SyncState): Promise<void> {
		state.lastSyncedAt = Date.now();
		fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), "utf-8");
		this.syncState = state;
	}

	// ============ Asset Operations ============

	async computeBinaryHash(data: ArrayBuffer): Promise<string> {
		// Return hex format (server expects hex for asset hash validation)
		return crypto.createHash("sha256").update(Buffer.from(data)).digest("hex");
	}

	async resolveAssetPath(assetPath: string, notePath: string): Promise<string | null> {
		// Use the pure function with Obsidian's link resolution algorithm
		// See docs/obsidian_links.md and src/sync/resolve.ts
		return resolveAssetPath(this, assetPath, notePath);
	}

	// ============ UI Callbacks (CLI versions) ============

	onProgress(progress: import("../types").Progress): void {
		if (this.verbose) {
			console.log(`  [${progress.step}] ${progress.current}/${progress.total}: ${progress.path ?? ""}`);
		}
	}

	async onConflict(conflicts: ConflictInfo[]): Promise<ConflictResolution[]> {
		if (this.conflictResolution === "fail") {
			console.error(`❌ ${conflicts.length} conflicts detected:`);
			for (const c of conflicts) {
				console.error(`   - ${c.path}`);
			}
			throw new Error(`Conflicts detected and --conflict-resolution=fail is set`);
		}

		const resolution = this.cliToConflictResolution(this.conflictResolution);
		console.log(`⚠️ ${conflicts.length} conflicts detected, resolving with: ${this.conflictResolution}`);
		return conflicts.map(() => resolution);
	}

	async onAssetConflict(conflicts: AssetConflictInfo[]): Promise<AssetConflictResolution[]> {
		if (this.conflictResolution === "fail") {
			console.error(`❌ ${conflicts.length} asset conflicts detected:`);
			for (const c of conflicts) {
				console.error(`   - ${c.path}`);
			}
			throw new Error(`Asset conflicts detected and --conflict-resolution=fail is set`);
		}

		const resolution = this.cliToAssetConflictResolution(this.conflictResolution);
		console.log(`⚠️ ${conflicts.length} asset conflicts detected, resolving with: ${this.conflictResolution}`);
		return conflicts.map(() => resolution);
	}

	private cliToConflictResolution(cli: CliConflictResolution): ConflictResolution {
		switch (cli) {
			case "local":
				return "keep_local";
			case "remote":
				return "keep_remote";
			case "skip":
				return "skip";
			default:
				return "keep_local";
		}
	}

	private cliToAssetConflictResolution(cli: CliConflictResolution): AssetConflictResolution {
		switch (cli) {
			case "local":
				return "keep_local";
			case "remote":
				return "keep_remote";
			case "skip":
				return "skip";
			default:
				return "keep_local";
		}
	}

	async onServerDeleted(paths: string[]): Promise<boolean> {
		// In CLI mode, we keep local files by default
		console.log(`⚠️ ${paths.length} files deleted on server, keeping local copies`);
		return false;
	}

	async confirmPush(paths: string[]): Promise<boolean> {
		// Auto-confirm in CLI mode
		console.log(`📤 Pushing ${paths.length} files...`);
		return true;
	}

	/**
	 * Inject meta fields into frontmatter.
	 * - If no meta configured, returns content unchanged.
	 * - If frontmatter exists, adds/updates fields.
	 * - If no frontmatter, creates one with meta fields.
	 */
	private injectMeta(content: string): string {
		// No meta to inject
		if (Object.keys(this.meta).length === 0) {
			return content;
		}

		// Check if file has frontmatter
		if (content.startsWith("---")) {
			const endIndex = content.indexOf("\n---", 3);
			if (endIndex !== -1) {
				// Has frontmatter - inject/update fields
				let frontmatter = content.slice(4, endIndex);
				const afterFrontmatter = content.slice(endIndex + 4);

				for (const [key, value] of Object.entries(this.meta)) {
					// Check if field exists (key: anything)
					const regex = new RegExp(`^${key}\\s*:.*$`, "m");
					if (regex.test(frontmatter)) {
						// Replace existing field
						frontmatter = frontmatter.replace(regex, `${key}: ${value}`);
					} else {
						// Add new field at the end
						frontmatter = frontmatter.trimEnd() + `\n${key}: ${value}`;
					}
				}

				return `---\n${frontmatter}\n---${afterFrontmatter}`;
			}
		}

		// No frontmatter - create one with meta fields
		const metaLines = Object.entries(this.meta)
			.map(([key, value]) => `${key}: ${value}`)
			.join("\n");
		return `---\n${metaLines}\n---\n${content}`;
	}

	/**
	 * Check if content has any of the publish fields with a truthy value in frontmatter.
	 * Parses YAML frontmatter from the content string.
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
