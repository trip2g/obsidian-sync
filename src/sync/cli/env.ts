/**
 * Node.js implementation of SyncEnv for CLI usage.
 * Uses generated GraphQL SDK from src/graphql.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
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
import { createClient, type ClientOptions } from "./client";
import type { Sdk } from "../../graphql";

/** CLI conflict resolution strategy */
export type CliConflictResolution = "local" | "remote" | "skip" | "fail";

export interface NodeEnvOptions extends ClientOptions {
	folder: string;
	twoWaySync: boolean;
	verbose?: boolean;
	conflictResolution?: CliConflictResolution;
}

const STATE_FILE = ".sync-state.json";

export class NodeEnv implements SyncEnv {
	private folder: string;
	private twoWaySync: boolean;
	private verbose: boolean;
	private conflictResolution: CliConflictResolution;
	private syncState: SyncState;
	private sdk: Sdk;

	constructor(options: NodeEnvOptions) {
		this.folder = path.resolve(options.folder);
		this.twoWaySync = options.twoWaySync;
		this.verbose = options.verbose ?? false;
		this.conflictResolution = options.conflictResolution ?? "local";
		this.syncState = this.loadSyncState();
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
		const fullPath = path.join(this.folder, filePath);
		return fs.existsSync(fullPath);
	}

	// ============ Server Operations ============

	async pushNotes(updates: NoteUpdate[], skipCommit: boolean): Promise<PushedNote[]> {
		if (updates.length === 0) {
			return [];
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

	async uploadAsset(params: UploadAssetParams): Promise<boolean> {
		try {
			const result = await this.sdk.UploadNoteAsset({
				input: {
					file: params.blob as File,
					noteId: parseInt(params.noteId),
					sha256Hash: params.sha256Hash,
					path: params.relativePath,
					absolutePath: params.absolutePath,
				},
			});

			if (result.uploadNoteAsset.__typename === "ErrorPayload") {
				throw new Error(`Upload failed: ${result.uploadNoteAsset.message}`);
			}

			if (result.uploadNoteAsset.uploadSkipped) {
				this.log(`⏩ Asset skipped (already exists): ${params.relativePath}`);
			} else {
				console.log(`✅ Asset uploaded: ${params.relativePath}`);
			}
			return true;
		} catch (e) {
			console.error(`❌ Failed to upload asset ${params.relativePath}: ${e}`);
			return false;
		}
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
		const hash = crypto.createHash("sha256").update(Buffer.from(data)).digest();
		// URL-safe base64 with padding (same as Python's urlsafe_b64encode)
		const b64 = hash.toString("base64");
		return b64.replace(/\+/g, "-").replace(/\//g, "_");
	}

	async resolveAssetPath(assetPath: string, notePath: string): Promise<string | null> {
		// In CLI mode, we use simple path resolution relative to note's directory
		// This doesn't support Obsidian's smart wikilink resolution

		// First try: asset path relative to note's directory
		const noteDir = path.dirname(notePath);
		const relativePath = noteDir ? path.join(noteDir, assetPath) : assetPath;
		if (await this.fileExists(relativePath)) {
			return relativePath;
		}

		// Second try: asset path from root
		if (await this.fileExists(assetPath)) {
			return assetPath;
		}

		// Third try: common assets folder
		const assetsPath = path.join("assets", assetPath);
		if (await this.fileExists(assetsPath)) {
			return assetsPath;
		}

		// Not found
		return null;
	}

	// ============ UI Callbacks (CLI versions) ============

	showProgress(message: string): void {
		console.log(message);
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
}
