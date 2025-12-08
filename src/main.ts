import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { FolderSuggest } from "./FolderSuggest";
import { SyncApi } from "./api";
import { sha256Hash, sha256HashBuffer, classifyAllFiles, updateSyncState, removeFromSyncState } from "./sync";
import { MigrationModal, ServerDeletedModal, PushConfirmModal } from "./ui/ConflictModal";
import { ConflictView, CONFLICT_VIEW_TYPE } from "./ui/ConflictView";
import { t, setLocale, detectLocale } from "./i18n";
import type {
	PluginSettings,
	SyncDir,
	SyncState,
	FileClassification,
	ConflictResolution,
	ConflictInfo,
	NoteWithAssets,
	RemoteAsset,
} from "./types";
import { DEFAULT_SETTINGS, DEFAULT_SYNC_STATE } from "./types";

const SYNC_STATE_KEY = "sync-state";

export default class Trip2gSyncPlugin extends Plugin {
	settings: PluginSettings;
	syncStates: Map<string, SyncState> = new Map(); // apiUrl -> SyncState
	ribbonIcon: HTMLElement | null = null;
	checkInterval: number | null = null;
	private boundCheckOnFocus: () => void;

	async onload() {
		// Initialize locale
		setLocale(detectLocale());

		await this.loadSettings();
		await this.loadSyncStates();

		// Register conflict view
		this.registerView(CONFLICT_VIEW_TYPE, (leaf) => new ConflictView(leaf));

		this.ribbonIcon = this.addRibbonIcon("sync", "Trip2g Sync", () => {
			if (this.settings.syncDirs.length === 0) {
				new Notice(t().noSyncDirsConfigured);
			} else if (this.settings.syncDirs.length === 1) {
				this.syncDirectory(this.settings.syncDirs[0]);
			} else {
				new SyncDirectoryModal(this.app, this).open();
			}
		});

		// Add badge styling class
		this.ribbonIcon.addClass("sync-ribbon-icon");

		this.addSettingTab(new SyncSettingTab(this.app, this));

		// Set up periodic check for pending changes (every 60 seconds)
		this.checkInterval = window.setInterval(() => {
			this.checkForPendingChanges();
		}, 60000);

		// Check on window focus
		this.boundCheckOnFocus = () => this.checkForPendingChanges();
		window.addEventListener("focus", this.boundCheckOnFocus);

		// Initial check after a short delay
		window.setTimeout(() => this.checkForPendingChanges(), 3000);
	}

	onunload() {
		// Clean up view
		this.app.workspace.detachLeavesOfType(CONFLICT_VIEW_TYPE);

		// Clean up timer and listeners
		if (this.checkInterval !== null) {
			window.clearInterval(this.checkInterval);
		}
		window.removeEventListener("focus", this.boundCheckOnFocus);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadSyncStates() {
		const stored = localStorage.getItem(SYNC_STATE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Record<string, SyncState>;
				for (const [key, value] of Object.entries(parsed)) {
					this.syncStates.set(key, value);
				}
			} catch {
				// Ignore parsing errors
			}
		}
	}

	async saveSyncStates() {
		const obj: Record<string, SyncState> = {};
		for (const [key, value] of this.syncStates) {
			obj[key] = value;
		}
		localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(obj));
	}

	getSyncState(apiUrl: string): SyncState {
		let state = this.syncStates.get(apiUrl);
		if (!state) {
			state = { ...DEFAULT_SYNC_STATE, files: {} };
			this.syncStates.set(apiUrl, state);
		}
		return state;
	}

	/**
	 * Check for pending changes and update badge
	 */
	async checkForPendingChanges(): Promise<void> {
		if (!this.ribbonIcon || this.settings.syncDirs.length === 0) {
			return;
		}

		let totalPull = 0;
		let totalPush = 0;
		let hasConflict = false;

		for (const syncDir of this.settings.syncDirs) {
			if (!syncDir.path || !syncDir.apiUrl || !syncDir.apiKey) {
				continue;
			}

			try {
				const api = new SyncApi(syncDir.apiUrl, syncDir.apiKey, this.manifest.version);
				const syncState = this.getSyncState(syncDir.apiUrl);

				// Get folder and local files
				const folder = this.app.vault.getAbstractFileByPath(syncDir.path);
				if (!folder || !(folder instanceof TFolder)) {
					continue;
				}

				const files = this.getAllMarkdownFiles(folder);
				const localFiles = new Map<string, string>();

				for (const file of files) {
					const content = await this.app.vault.read(file);
					const hash = await sha256Hash(content);
					const relativePath = this.getRelativePath(file, folder);
					localFiles.set(relativePath, hash);
				}

				// Get server hashes (silent - don't show errors for background checks)
				const serverHashes = await api.fetchServerHashes(true);

				// Classify files
				const classifications = classifyAllFiles(localFiles, serverHashes, syncState);

				for (const c of classifications) {
					switch (c.action) {
						case "pull":
						case "remote_only":
							totalPull++;
							break;
						case "push":
						case "local_only":
							totalPush++;
							break;
						case "conflict":
							hasConflict = true;
							break;
					}
				}
			} catch {
				// Silently ignore errors during background check
			}
		}

		// Update badge
		this.ribbonIcon.removeClass("has-pending", "has-pull", "has-push", "has-conflict");

		if (hasConflict) {
			this.ribbonIcon.addClass("has-pending", "has-conflict");
			this.ribbonIcon.setAttribute("aria-label", t().pendingChanges(totalPull, totalPush));
		} else if (totalPull > 0 && totalPush > 0) {
			this.ribbonIcon.addClass("has-pending");
			this.ribbonIcon.setAttribute("aria-label", t().pendingChanges(totalPull, totalPush));
		} else if (totalPull > 0) {
			this.ribbonIcon.addClass("has-pending", "has-pull");
			this.ribbonIcon.setAttribute("aria-label", t().pendingPull(totalPull));
		} else if (totalPush > 0) {
			this.ribbonIcon.addClass("has-pending", "has-push");
			this.ribbonIcon.setAttribute("aria-label", t().pendingPush(totalPush));
		} else {
			this.ribbonIcon.setAttribute("aria-label", "Trip2g Sync");
		}
	}

	async testConnection(syncDir: SyncDir): Promise<string | null> {
		const api = new SyncApi(syncDir.apiUrl, syncDir.apiKey, this.manifest.version);
		return api.testConnection();
	}

	/**
	 * Check if a file has any of the frontmatter fields with a truthy value.
	 * Supports comma-separated list of field names (e.g., "publish, public").
	 */
	private hasPublishField(file: TFile, publishFields: string): boolean {
		if (!publishFields) return true; // No filter = all files are publishable

		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) return false;

		const fields = publishFields.split(",").map((f) => f.trim()).filter((f) => f);
		return fields.some((field) => Boolean(frontmatter[field]));
	}

	async syncDirectory(syncDir: SyncDir): Promise<void> {
		if (!syncDir.path || !syncDir.apiUrl || !syncDir.apiKey) {
			new Notice(t().syncError);
			return;
		}

		new Notice(t().syncStarting);

		const api = new SyncApi(syncDir.apiUrl, syncDir.apiKey, this.manifest.version);
		const syncState = this.getSyncState(syncDir.apiUrl);

		try {
			// Step 1: Get folder and local files
			const folder = this.app.vault.getAbstractFileByPath(syncDir.path);
			if (!folder || !(folder instanceof TFolder)) {
				new Notice(`Folder not found: ${syncDir.path}`);
				return;
			}

			const files = this.getAllMarkdownFiles(folder);
			const localFiles = new Map<string, string>();

			for (const file of files) {
				const content = await this.app.vault.read(file);
				const hash = await sha256Hash(content);
				const relativePath = this.getRelativePath(file, folder);
				localFiles.set(relativePath, hash);
			}

			// Step 2: Get server hashes
			const serverHashes = await api.fetchServerHashes();

			// Step 3: Classify all files
			const classifications = classifyAllFiles(localFiles, serverHashes, syncState);

			// Step 4: Check if this is first sync (migration scenario)
			const isFirstSync = Object.keys(syncState.files).length === 0;
			const conflicts = classifications.filter((c) => c.action === "conflict");

			if (isFirstSync && conflicts.length > 0) {
				// Show migration modal
				await this.handleMigration(api, syncDir, folder, classifications, syncState);
			} else {
				// Normal sync flow
				await this.processSyncActions(api, syncDir, folder, classifications, syncState);
			}

			await this.saveSyncStates();
		} catch (error) {
			console.error("Sync error:", error);
			new Notice(`${t().syncError}: ${(error as Error).message}`);
		}
	}

	private async handleMigration(
		api: SyncApi,
		syncDir: SyncDir,
		folder: TFolder,
		classifications: FileClassification[],
		syncState: SyncState
	) {
		const conflicts = classifications.filter((c) => c.action === "conflict");

		return new Promise<void>((resolve) => {
			new MigrationModal(this.app, conflicts.length, async (trustServer) => {
				if (trustServer) {
					// Trust server: update lastSyncedHash to remote for all files
					for (const c of classifications) {
						if (c.remoteHash) {
							updateSyncState(syncState, c.path, c.remoteHash);
						}
					}
					// Now do a normal pull for files where server is newer
					const pullActions = classifications.filter(
						(c) => c.action === "conflict" || c.action === "remote_only"
					);
					await this.executePulls(api, folder, pullActions, syncState);
					new Notice(t().pulledFiles(pullActions.length));
				} else {
					// Review each conflict
					await this.processSyncActions(api, syncDir, folder, classifications, syncState);
				}
				resolve();
			}).open();
		});
	}

	private async processSyncActions(
		api: SyncApi,
		syncDir: SyncDir,
		folder: TFolder,
		classifications: FileClassification[],
		syncState: SyncState
	) {
		const pulls: FileClassification[] = [];
		const pushes: FileClassification[] = [];
		const conflicts: FileClassification[] = [];
		const localOnly: FileClassification[] = [];
		const localDeleted: FileClassification[] = [];
		const serverDeleted: FileClassification[] = [];
		let unchanged = 0;

		const publishField = syncDir.publishField || "";

		for (const c of classifications) {
			const fullPath = folder.path === "/" ? c.path : `${folder.path}/${c.path}`;
			const localFile = this.app.vault.getAbstractFileByPath(fullPath);
			const hasPublish = localFile instanceof TFile ? this.hasPublishField(localFile, publishField) : true;

			switch (c.action) {
				case "unchanged":
					unchanged++;
					break;
				case "pull":
					// Don't pull if local file exists and doesn't have publish field (protected)
					if (publishField && localFile instanceof TFile && !hasPublish) {
						// Skip - protected local file
					} else {
						pulls.push(c);
					}
					break;
				case "push":
					// Only push if file has publish field (or no filter set)
					if (hasPublish) {
						pushes.push(c);
					}
					break;
				case "conflict":
					// Don't show conflict if local file is protected (no publish field)
					if (publishField && localFile instanceof TFile && !hasPublish) {
						// Skip - protected local file, server changes are ignored
					} else {
						conflicts.push(c);
					}
					break;
				case "local_only":
					// Only push if file has publish field (or no filter set)
					if (hasPublish) {
						localOnly.push(c);
					}
					break;
				case "remote_only":
					// Fallback: treat as pull (new file from server)
					pulls.push(c);
					break;
				case "local_deleted":
					// Only hide on server if file was publishable
					if (hasPublish) {
						localDeleted.push(c);
					}
					break;
				case "server_deleted":
					serverDeleted.push(c);
					break;
			}
		}

		// Execute pulls first (get updates from server)
		if (pulls.length > 0) {
			await this.executePulls(api, folder, pulls, syncState);
			new Notice(t().pulledFiles(pulls.length));
		}

		// Handle conflicts
		if (conflicts.length > 0) {
			await this.handleConflicts(api, folder, conflicts, syncState);
		}

		// Push local changes (including local_only files)
		const toPush = [...pushes, ...localOnly];
		if (toPush.length > 0) {
			const shouldPush = await this.confirmPush(toPush);
			if (shouldPush) {
				await this.executePushes(api, syncDir, folder, toPush, syncState);
				new Notice(t().pushedFiles(toPush.length));
			}
		}

		// Handle locally deleted files - hide on server
		if (localDeleted.length > 0) {
			await this.handleLocalDeleted(api, localDeleted, syncState);
		}

		// Handle server deleted files - ask user what to do
		if (serverDeleted.length > 0) {
			await this.handleServerDeleted(folder, serverDeleted, syncState);
		}

		// Check assets for all synced notes (unchanged + just pulled)
		const syncedPaths = classifications
			.filter((c) => c.action === "unchanged" || c.action === "pull")
			.map((c) => c.path);
		if (syncedPaths.length > 0) {
			await this.checkAndDownloadAssets(api, syncedPaths);
		}

		if (unchanged > 0 && pulls.length === 0 && pushes.length === 0 && conflicts.length === 0) {
			new Notice(t().allFilesUpToDate);
		}

		// Update badge after sync
		this.checkForPendingChanges();
	}

	private async checkAndDownloadAssets(api: SyncApi, paths: string[]) {
		let downloadedCount = 0;

		// Fetch only asset info (no content) in batches of 100
		const allAssets = await api.fetchMultipleNoteAssets(paths);

		for (const [, assets] of allAssets) {
			const count = await this.downloadMissingAssetsWithCount(api, assets);
			downloadedCount += count;
		}

		if (downloadedCount > 0) {
			new Notice(`Downloaded ${downloadedCount} assets`);
		}
	}

	private async downloadMissingAssetsWithCount(
		api: SyncApi,
		assets: RemoteAsset[]
	): Promise<number> {
		let count = 0;
		for (const asset of assets) {
			try {
				// Use absolutePath from server - exact location in vault
				const assetPath = asset.absolutePath;
				const existingFile = this.app.vault.getAbstractFileByPath(assetPath);

				if (existingFile instanceof TFile) {
					// Asset exists - check hash
					const localBuffer = await this.app.vault.readBinary(existingFile);
					const localHash = await sha256HashBuffer(localBuffer);

					if (localHash === asset.hash) {
						continue;
					}
					console.log(`[Trip2g Sync] Asset ${assetPath} hash differs: local=${localHash.slice(0, 8)}... remote=${asset.hash.slice(0, 8)}...`);
				} else {
					console.log(`[Trip2g Sync] Asset ${assetPath} not found locally`);
				}

				// Asset missing or hash differs - download
				const data = await api.downloadAsset(asset.url);
				if (!data) {
					console.log(`[Trip2g Sync] Failed to download asset ${assetPath}`);
					continue;
				}

				// Create directories if needed
				const assetDir = assetPath.substring(0, assetPath.lastIndexOf("/"));
				if (assetDir && !this.app.vault.getAbstractFileByPath(assetDir)) {
					await this.app.vault.createFolder(assetDir);
				}

				// Write asset file
				if (existingFile instanceof TFile) {
					await this.app.vault.modifyBinary(existingFile, data);
					console.log(`[Trip2g Sync] Updated asset: ${assetPath}`);
				} else {
					await this.app.vault.createBinary(assetPath, data);
					console.log(`[Trip2g Sync] Created asset: ${assetPath}`);
				}
				count++;
			} catch (error) {
				console.error(`[Trip2g Sync] Error downloading asset ${asset.absolutePath}:`, error);
			}
		}

		return count;
	}

	private async executePulls(
		api: SyncApi,
		folder: TFolder,
		pulls: FileClassification[],
		syncState: SyncState
	) {
		const paths = pulls.map((p) => p.path);
		const contents = await api.fetchMultipleNoteContents(paths);

		for (const [path, noteData] of contents) {
			const fullPath = folder.path === "/" ? path : `${folder.path}/${path}`;

			// Create directories if needed
			const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
			if (dirPath && !this.app.vault.getAbstractFileByPath(dirPath)) {
				await this.app.vault.createFolder(dirPath);
			}

			// Write or update file
			const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, noteData.content);
			} else {
				await this.app.vault.create(fullPath, noteData.content);
			}

			// Update sync state
			const hash = await sha256Hash(noteData.content);
			updateSyncState(syncState, path, hash);

			// Download missing assets
			if (noteData.assets && noteData.assets.length > 0) {
				await this.downloadMissingAssets(api, noteData.assets);
			}
		}
	}

	private async downloadMissingAssets(
		api: SyncApi,
		assets: RemoteAsset[]
	) {
		for (const asset of assets) {
			try {
				// Use absolutePath from server - exact location in vault
				const assetPath = asset.absolutePath;
				const existingFile = this.app.vault.getAbstractFileByPath(assetPath);

				if (existingFile instanceof TFile) {
					// Asset exists - check hash
					const localBuffer = await this.app.vault.readBinary(existingFile);
					const localHash = await sha256HashBuffer(localBuffer);

					if (localHash === asset.hash) {
						continue;
					}
				}

				// Asset missing or hash differs - download
				const data = await api.downloadAsset(asset.url);
				if (!data) {
					continue;
				}

				// Create directories if needed
				const assetDir = assetPath.substring(0, assetPath.lastIndexOf("/"));
				if (assetDir && !this.app.vault.getAbstractFileByPath(assetDir)) {
					await this.app.vault.createFolder(assetDir);
				}

				// Write asset file
				if (existingFile instanceof TFile) {
					await this.app.vault.modifyBinary(existingFile, data);
				} else {
					await this.app.vault.createBinary(assetPath, data);
				}
			} catch (error) {
				console.error(`[Trip2g Sync] Error downloading asset ${asset.absolutePath}:`, error);
			}
		}
	}

	private async handleConflicts(
		api: SyncApi,
		folder: TFolder,
		conflicts: FileClassification[],
		syncState: SyncState
	) {
		// Prepare all conflict infos
		const conflictInfos: Array<{ classification: FileClassification; info: ConflictInfo }> = [];

		for (const conflict of conflicts) {
			const fullPath = folder.path === "/" ? conflict.path : `${folder.path}/${conflict.path}`;
			const file = this.app.vault.getAbstractFileByPath(fullPath);

			if (!(file instanceof TFile)) {
				continue;
			}

			const localContent = await this.app.vault.read(file);
			const remoteContent = await api.fetchNoteContent(conflict.path);

			if (remoteContent === null) {
				// Remote no longer exists, skip
				continue;
			}

			conflictInfos.push({
				classification: conflict,
				info: {
					path: conflict.path,
					localContent,
					remoteContent,
					localHash: conflict.localHash!,
					remoteHash: conflict.remoteHash!,
				},
			});
		}

		if (conflictInfos.length === 0) {
			return;
		}

		// Open conflict view and wait for all resolutions
		const resolutions = await this.showConflictView(conflictInfos.map((c) => c.info));

		// Process resolutions
		for (let i = 0; i < conflictInfos.length; i++) {
			const { classification, info } = conflictInfos[i];
			const resolution = resolutions[i];
			await this.resolveConflict(api, folder, classification, info, resolution, syncState);
		}
	}

	private async showConflictView(conflicts: ConflictInfo[]): Promise<ConflictResolution[]> {
		// Open the conflict view in a new leaf
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: CONFLICT_VIEW_TYPE,
			active: true,
		});

		const view = leaf.view as ConflictView;

		// Create promises for each conflict resolution
		const resolutions: ConflictResolution[] = [];
		const promises: Promise<ConflictResolution>[] = conflicts.map((conflict) => {
			return new Promise((resolve) => {
				resolutions.push("skip"); // default
				const index = resolutions.length - 1;
				// Store resolver to be called by view
				(conflict as ConflictInfo & { _resolve?: (r: ConflictResolution) => void })._resolve = (r) => {
					resolutions[index] = r;
					resolve(r);
				};
			});
		});

		// Set conflicts in view with resolvers
		const queueItems = conflicts.map((conflict, i) => ({
			conflict,
			resolve: (resolution: ConflictResolution) => {
				resolutions[i] = resolution;
				(conflicts[i] as ConflictInfo & { _resolve?: (r: ConflictResolution) => void })._resolve?.(resolution);
			},
		}));

		view.setConflicts(queueItems);

		// Wait for all to be resolved
		await Promise.all(promises);

		return resolutions;
	}

	private async resolveConflict(
		api: SyncApi,
		folder: TFolder,
		classification: FileClassification,
		conflict: ConflictInfo,
		resolution: ConflictResolution,
		syncState: SyncState
	) {
		const fullPath = folder.path === "/" ? conflict.path : `${folder.path}/${conflict.path}`;
		const file = this.app.vault.getAbstractFileByPath(fullPath);

		switch (resolution) {
			case "keep_local":
				// Push local to server immediately
				if (file instanceof TFile) {
					const notes = await api.pushNotes([{ path: conflict.path, content: conflict.localContent }]);
					updateSyncState(syncState, conflict.path, conflict.localHash);
					new Notice(`${t().pushed}: ${conflict.path}`);
					// Process assets if any
					for (const note of notes) {
						await this.processNoteAssets(api, note, folder);
					}
				}
				break;

			case "keep_remote":
				if (file instanceof TFile) {
					await this.app.vault.modify(file, conflict.remoteContent);
					updateSyncState(syncState, conflict.path, conflict.remoteHash);
				}
				break;

			case "keep_both":
				// Create a copy with server version
				const ext = conflict.path.substring(conflict.path.lastIndexOf("."));
				const baseName = conflict.path.substring(0, conflict.path.lastIndexOf("."));
				const newPath = `${baseName} (server)${ext}`;
				const newFullPath = folder.path === "/" ? newPath : `${folder.path}/${newPath}`;

				await this.app.vault.create(newFullPath, conflict.remoteContent);

				// Update sync state for both files
				updateSyncState(syncState, conflict.path, conflict.localHash);
				const remoteHash = await sha256Hash(conflict.remoteContent);
				updateSyncState(syncState, newPath, remoteHash);
				break;

			case "skip":
				// Do nothing, file will show as conflict again next sync
				break;
		}
	}

	private async executePushes(
		api: SyncApi,
		syncDir: SyncDir,
		folder: TFolder,
		pushes: FileClassification[],
		syncState: SyncState
	) {
		const updates: Array<{ path: string; content: string }> = [];

		for (const push of pushes) {
			const fullPath = folder.path === "/" ? push.path : `${folder.path}/${push.path}`;
			const file = this.app.vault.getAbstractFileByPath(fullPath);

			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				updates.push({ path: push.path, content });
			}
		}

		if (updates.length === 0) {
			return;
		}

		const notes = await api.pushNotes(updates);

		// Update sync state and process assets
		for (const update of updates) {
			const hash = await sha256Hash(update.content);
			updateSyncState(syncState, update.path, hash);
		}

		// Process assets
		for (const note of notes) {
			await this.processNoteAssets(api, note, folder);
		}
	}

	private async handleLocalDeleted(api: SyncApi, localDeleted: FileClassification[], syncState: SyncState) {
		// Files were deleted locally - hide them on server
		const paths = localDeleted.map((r) => r.path);

		if (paths.length > 0) {
			const success = await api.hideNotes(paths);
			if (success) {
				for (const path of paths) {
					removeFromSyncState(syncState, path);
				}
				new Notice(t().hiddenNotes(paths.length));
			}
		}
	}

	private async handleServerDeleted(
		folder: TFolder,
		serverDeleted: FileClassification[],
		syncState: SyncState
	): Promise<void> {
		const paths = serverDeleted.map((c) => c.path);

		return new Promise((resolve) => {
			new ServerDeletedModal(this.app, paths, async (deleteLocally) => {
				if (deleteLocally) {
					// Delete local files
					let deletedCount = 0;
					for (const c of serverDeleted) {
						const fullPath = folder.path === "/" ? c.path : `${folder.path}/${c.path}`;
						const file = this.app.vault.getAbstractFileByPath(fullPath);
						if (file instanceof TFile) {
							await this.app.vault.delete(file);
							removeFromSyncState(syncState, c.path);
							deletedCount++;
						}
					}
					new Notice(t().deletedLocally(deletedCount));
				} else {
					// Keep locally - update syncState to current local hash
					for (const c of serverDeleted) {
						if (c.localHash) {
							updateSyncState(syncState, c.path, c.localHash);
						}
					}
					new Notice(t().keptLocally(serverDeleted.length));
				}
				resolve();
			}).open();
		});
	}

	private async confirmPush(toPush: FileClassification[]): Promise<boolean> {
		// Skip confirmation if setting is enabled
		if (this.settings.skipPushConfirmation) {
			return true;
		}

		const paths = toPush.map((c) => c.path);

		return new Promise((resolve) => {
			new PushConfirmModal(this.app, paths, async (proceed, dontAskAgain) => {
				if (dontAskAgain) {
					this.settings.skipPushConfirmation = true;
					await this.saveSettings();
				}
				resolve(proceed);
			}).open();
		});
	}

	private async processNoteAssets(api: SyncApi, note: NoteWithAssets, folder: TFolder) {
		if (!note.assets || note.assets.length === 0) {
			return;
		}

		const notePathInVault = folder.path === "/" ? note.path : `${folder.path}/${note.path}`;
		const noteFile = this.app.vault.getAbstractFileByPath(notePathInVault);

		if (!(noteFile instanceof TFile)) {
			return;
		}

		for (const asset of note.assets) {
			try {
				const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(asset.path, noteFile.path);

				if (!(resolvedFile instanceof TFile)) {
					continue;
				}

				const arrayBuffer = await this.app.vault.readBinary(resolvedFile);
				const localHash = await sha256HashBuffer(arrayBuffer);

				if (!asset.sha256Hash || asset.sha256Hash !== localHash) {
					const blob = new Blob([arrayBuffer]);
					await api.uploadAsset(note.id, blob, resolvedFile.name, asset.path, resolvedFile.path, localHash);
				}
			} catch (error) {
				console.error(`Error processing asset ${asset.path}:`, error);
			}
		}
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

	private getRelativePath(file: TFile, baseFolder: TFolder): string {
		const basePath = baseFolder.path;
		const filePath = file.path;

		if (filePath.startsWith(basePath)) {
			return filePath.slice(basePath.length + (basePath.length > 0 ? 1 : 0));
		}

		return filePath;
	}
}

class SyncDirectoryModal extends Modal {
	plugin: Trip2gSyncPlugin;

	constructor(app: App, plugin: Trip2gSyncPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		const i18n = t();
		contentEl.empty();
		contentEl.createEl("h2", { text: i18n.selectSyncDirectory });

		this.plugin.settings.syncDirs.forEach((dir) => {
			const dirEl = contentEl.createEl("div", { cls: "sync-dir-item" });
			dirEl.createEl("h3", { text: dir.path || "/" });
			dirEl.createEl("p", { text: `API URL: ${dir.apiUrl}` });

			const syncBtn = dirEl.createEl("button", { text: i18n.syncThisDirectory });
			syncBtn.addEventListener("click", async () => {
				this.close();
				await this.plugin.syncDirectory(dir);
			});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class SyncSettingTab extends PluginSettingTab {
	plugin: Trip2gSyncPlugin;

	constructor(app: App, plugin: Trip2gSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const i18n = t();
		containerEl.empty();

		new Setting(containerEl).setName(i18n.settingsHeading).setHeading();

		// Description with onboarding link
		const descEl = containerEl.createEl("p", { cls: "setting-item-description" });
		descEl.appendText(i18n.settingsDescription + " ");
		descEl.createEl("a", {
			text: i18n.onboardingLink,
			href: "https://trip2g.com/docs/onboarding",
		});

		const buttonsContainer = new Setting(containerEl);
		buttonsContainer.addButton((button) => {
			button
				.setButtonText(i18n.addSyncDirectory)
				.setCta()
				.onClick(() => {
					this.plugin.settings.syncDirs.push({
						path: "/",
						apiKey: "",
						apiUrl: "",
						error: undefined,
					});
					this.plugin.saveSettings();
					this.display();
				});
		});

		if (this.plugin.settings.syncDirs.length > 0) {
			buttonsContainer.addButton((button) => {
				button.setButtonText(i18n.testAllConnections).onClick(async () => {
					let successCount = 0;
					let failCount = 0;

					for (let i = 0; i < this.plugin.settings.syncDirs.length; i++) {
						const dir = this.plugin.settings.syncDirs[i];
						const error = await this.plugin.testConnection(dir);
						this.plugin.settings.syncDirs[i].error = error;
						if (error === null) {
							successCount++;
						} else {
							failCount++;
						}
					}

					this.plugin.saveSettings();
					this.display();

					new Notice(i18n.successfulConnections(successCount, failCount));
				});
			});
		}

		this.plugin.settings.syncDirs.forEach((dir, dirIndex) => {
			// Section header with action buttons
			const headerSetting = new Setting(containerEl);
			headerSetting.setName(`Connection ${dirIndex + 1}`);
			headerSetting.setHeading();

			headerSetting.addExtraButton((button) => {
				button
					.setIcon("wifi")
					.setTooltip(i18n.testConnection)
					.onClick(async () => {
						const error = await this.plugin.testConnection(dir);
						this.plugin.settings.syncDirs[dirIndex].error = error;
						this.plugin.saveSettings();
						this.display();

						if (error === null) {
							new Notice(i18n.connectionSuccessful);
						} else {
							new Notice(`${i18n.connectionFailed}: ${error}`);
						}
					});
			});

			headerSetting.addExtraButton((button) => {
				button
					.setIcon("reset")
					.setTooltip(i18n.resetSyncState)
					.onClick(async () => {
						if (confirm(i18n.resetSyncStateConfirm)) {
							this.plugin.syncStates.delete(dir.apiUrl);
							await this.plugin.saveSyncStates();
							new Notice(i18n.syncStateReset);
						}
					});
			});

			headerSetting.addExtraButton((button) => {
				button
					.setIcon("cross")
					.setTooltip(i18n.removeDirectory)
					.onClick(() => {
						if (confirm(i18n.removeDirectoryConfirm)) {
							this.plugin.settings.syncDirs.splice(dirIndex, 1);
							this.plugin.saveSettings();
							this.display();
						}
					});
			});

			if (dir.error) {
				const errorEl = containerEl.createEl("div", {
					cls: "setting-item-description",
					text: `${i18n.error}: ${dir.error}`,
				});
				errorEl.style.color = "var(--text-error)";
				errorEl.style.marginBottom = "10px";
			}

			// API URL
			new Setting(containerEl)
				.setName(i18n.apiUrlLabel)
				.setDesc(i18n.apiUrlDesc)
				.addText((text) => {
					text.setPlaceholder(i18n.apiUrlPlaceholder)
						.setValue(dir.apiUrl)
						.onChange((newApiUrl) => {
							this.plugin.settings.syncDirs[dirIndex].apiUrl = newApiUrl;
							this.plugin.settings.syncDirs[dirIndex].error = undefined;
							this.plugin.saveSettings();
						});
				});

			// API Key
			new Setting(containerEl)
				.setName(i18n.apiKeyLabel)
				.setDesc(i18n.apiKeyDesc)
				.addText((text) => {
					text.setPlaceholder(i18n.apiKeyPlaceholder)
						.setValue(dir.apiKey)
						.onChange((newApiKey) => {
							this.plugin.settings.syncDirs[dirIndex].apiKey = newApiKey;
							this.plugin.settings.syncDirs[dirIndex].error = undefined;
							this.plugin.saveSettings();
						});
					text.inputEl.type = "password";
				});

			// Sync folder
			new Setting(containerEl)
				.setName(i18n.pathLabel)
				.setDesc(i18n.pathDesc)
				.addSearch((cb) => {
					new FolderSuggest(this.app, cb.inputEl);
					cb.setPlaceholder(i18n.pathPlaceholder)
						.setValue(dir.path)
						.onChange((newPath) => {
							this.plugin.settings.syncDirs[dirIndex].path = newPath;
							this.plugin.settings.syncDirs[dirIndex].error = undefined;
							this.plugin.saveSettings();
						});
				});

			// Publish fields
			new Setting(containerEl)
				.setName(i18n.publishFieldLabel)
				.setDesc(i18n.publishFieldDesc)
				.addText((text) => {
					text.setPlaceholder(i18n.publishFieldPlaceholder)
						.setValue(dir.publishField || "")
						.onChange((newField) => {
							this.plugin.settings.syncDirs[dirIndex].publishField = newField || undefined;
							this.plugin.saveSettings();
						});
				});
		});

		// Global settings
		new Setting(containerEl)
			.setName(i18n.skipPushConfirmationLabel)
			.setDesc(i18n.skipPushConfirmationDesc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.skipPushConfirmation ?? false).onChange(async (value) => {
					this.plugin.settings.skipPushConfirmation = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
