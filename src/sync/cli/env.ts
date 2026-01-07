/**
 * CLI implementation of SyncEnv using Node.js fs APIs.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { isAlwaysPublishable } from "../utils";
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
import { createClient, type ClientOptions } from "./client";
import type { Sdk } from "../../graphql";

/** CLI conflict resolution strategy */
export type CliConflictResolution = "local" | "remote" | "skip" | "fail";

export interface NodeEnvOptions extends ClientOptions {
	folder: string;
	twoWaySync: boolean;
	verbose?: boolean;
	conflictResolution?: CliConflictResolution;
	publishField?: string;
}

const STATE_FILE = ".sync-state.json";

export class NodeEnv implements SyncEnv {
	private folder: string;
	private twoWaySync: boolean;
	private verbose: boolean;
	private conflictResolution: CliConflictResolution;
	private publishField: string;
	private syncState: SyncState;
	private sdk: Sdk;
	private apiUrl: string;
	private apiKey: string;

	pushBatchSize = 100;

	constructor(options: NodeEnvOptions) {
		this.folder = path.resolve(options.folder);
		this.twoWaySync = options.twoWaySync;
		this.verbose = options.verbose ?? false;
		this.conflictResolution = options.conflictResolution ?? "local";
		this.publishField = options.publishField ?? "";
		this.syncState = this.loadSyncState();
		this.apiUrl = options.apiUrl;
		this.apiKey = options.apiKey;
		this.sdk = createClient({ apiUrl: options.apiUrl, apiKey: options.apiKey });
	}

	private loadSyncState(): SyncState {
		const statePath = path.join(this.folder, STATE_FILE);
		try {
			if (fs.existsSync(statePath)) {
				const data = fs.readFileSync(statePath, "utf-8");
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
		const files: LocalFile[] = [];
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
					const ext = path.extname(entry.name).toLowerCase();
					if (ext === ".md" || ext === ".html") {
						const stat = fs.statSync(fullPath);
						const relPath = path.relative(this.folder, fullPath);
						files.push({
							path: relPath,
							mtime: stat.mtimeMs,
						});
					}
				}
			}
		};
		walk(this.folder);
		return files;
	}

	async getServerHashes(): Promise<ServerHash[]> {
		try {
			const result = await this.sdk.FetchServerHashes();
			return result.notePaths.map((np) => ({
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
		const fullPath = path.join(this.folder, filePath);
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

		try {
			const result = await this.sdk.PushNotes({
				input: {
					updates: updates.map((u) => ({
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
		} catch (e) {
			console.error(`❌ Failed to push notes: ${e}`);
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
		const maxRetries = 10;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const success = await this.uploadAssetOnce(params);
				if (success) {
					return true;
				}
			} catch (e) {
				if (attempt < maxRetries) {
					this.log(`⚠️ Upload attempt ${attempt} failed, retrying: ${params.relativePath}`);
					continue;
				}
				console.error(`❌ Failed to upload asset ${params.relativePath} after ${maxRetries} attempts: ${e}`);
				return false;
			}
		}
		return false;
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
		try {
			const response = await fetch(url);
			if (!response.ok) {
				console.error(`❌ Failed to download asset: HTTP ${response.status}`);
				return null;
			}
			return await response.arrayBuffer();
		} catch (e) {
			console.error(`❌ Failed to download asset from ${url}: ${e}`);
			return null;
		}
	}

	async commitNotes(): Promise<void> {
		try {
			const result = await this.sdk.CommitNotes();

			if ("message" in result.commitNotes) {
				throw new Error(`Commit failed: ${result.commitNotes.message}`);
			}

			console.log("✅ Notes committed");
		} catch (e) {
			console.error(`❌ Failed to commit notes: ${e}`);
		}
	}

	// ============ State ============

	async saveSyncState(state: SyncState): Promise<void> {
		const statePath = path.join(this.folder, STATE_FILE);
		state.lastSyncedAt = Date.now();
		fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
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
