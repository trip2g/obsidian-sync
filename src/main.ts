import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, requestUrl } from "obsidian";
import { GraphQLClient } from "graphql-request";
import { FolderSuggest } from "./FolderSuggest";
import { sha256Hash, classifyAllFiles } from "./syncOld";
import { MigrationModal, ServerDeletedModal, PushConfirmModal, AssetConflictModal, type AssetConflict, type AssetConflictResolution as UIAssetConflictResolution } from "./ui/ConflictModal";
import { ConflictView, CONFLICT_VIEW_TYPE } from "./ui/ConflictView";
import { t, setLocale, detectLocale } from "./i18n";
import { getSdk, type Sdk } from "./graphql";
import { classifySync } from "./sync/classify";
import { filterPlan } from "./sync/filter";
import { executePlan } from "./sync/execute";
import { ObsidianSyncEnv } from "./env";
import type {
	PluginSettings,
	SyncDir,
	SyncState,
	ConflictResolution,
	ConflictInfo,
} from "./types";
import type {
	ConflictInfo as SyncConflictInfo,
	ConflictResolution as SyncConflictResolution,
	AssetConflictInfo,
	AssetConflictResolution,
	Progress,
} from "./sync/types";
import { DEFAULT_SETTINGS, DEFAULT_SYNC_STATE } from "./types";

const SYNC_STATE_KEY = "sync-state";

function normalizeApiUrl(url: string): string {
	return url.replace(/\/+$/, ""); // Remove trailing slashes
}

function createSdk(apiUrl: string, apiKey: string, pluginVersion: string): Sdk {
	const client = new GraphQLClient(`${normalizeApiUrl(apiUrl)}/graphql`, {
		headers: {
			"X-API-Key": apiKey,
			"X-Plugin-Version": pluginVersion,
		},
	});
	return getSdk(client);
}

export default class Trip2gSyncPlugin extends Plugin {
	settings: PluginSettings;
	syncStates: Map<string, SyncState> = new Map(); // apiUrl -> SyncState
	ribbonIcon: HTMLElement | null = null;
	checkInterval: number | null = null;
	private boundCheckOnFocus: () => void;
	private isSyncing: boolean = false;

	async onload() {
		// Initialize locale
		setLocale(detectLocale());

		await this.loadSettings();
		await this.loadSyncStates();

		// Register conflict view
		this.registerView(CONFLICT_VIEW_TYPE, (leaf) => new ConflictView(leaf));

		this.ribbonIcon = this.addRibbonIcon("sync", "Trip2g Sync", () => {
			if (this.isSyncing) {
				return; // Already syncing
			}
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
				const sdk = createSdk(syncDir.apiUrl, syncDir.apiKey, this.manifest.version);
				const syncState = this.getSyncState(syncDir.apiUrl);

				// Get folder and local files
				const folder = this.app.vault.getAbstractFileByPath(syncDir.path);
				if (!folder || !(folder instanceof TFolder)) {
					continue;
				}

				const files = this.getAllMarkdownFiles(folder);
				const localFiles = new Map<string, string>();
				const cachedMtimes = syncState.mtimes || {};
				const cachedLocalHashes = syncState.localHashes || {};

				for (const file of files) {
					const relativePath = this.getRelativePath(file, folder);
					const mtime = file.stat.mtime;

					// Use cached hash if mtime hasn't changed
					const cachedMtime = cachedMtimes[relativePath];
					const cachedHash = cachedLocalHashes[relativePath];
					if (cachedMtime === mtime && cachedHash) {
						localFiles.set(relativePath, cachedHash);
					} else {
						const content = await this.app.vault.read(file);
						const hash = await sha256Hash(content);
						localFiles.set(relativePath, hash);
					}
				}

				// Get server hashes (silent - don't show errors for background checks)
				const data = await sdk.FetchServerHashes();
				const serverHashes = new Map<string, string>();
				for (const item of data.notePaths) {
					if (item.path && item.hash) {
						serverHashes.set(item.path, item.hash);
					}
				}

				// Classify files
				const classifications = classifyAllFiles(localFiles, serverHashes, syncState);
				const twoWaySync = syncDir.twoWaySync ?? false;

				for (const c of classifications) {
					switch (c.action) {
						case "pull":
						case "remote_only":
							// Only count pulls if two-way sync is enabled
							if (twoWaySync) {
								console.log(`[Trip2g Sync] Badge: ${c.path} -> ${c.action}`);
								totalPull++;
							}
							break;
						case "push":
						case "local_only":
							console.log(`[Trip2g Sync] Badge: ${c.path} -> ${c.action}`);
							totalPush++;
							break;
						case "conflict":
							// Only show conflict if two-way sync is enabled
							// Otherwise conflicts auto-resolve to local version (push)
							if (twoWaySync) {
								console.log(`[Trip2g Sync] Badge: ${c.path} -> conflict`);
								hasConflict = true;
							} else {
								console.log(`[Trip2g Sync] Badge: ${c.path} -> conflict (will push)`);
								totalPush++;
							}
							break;
					}
				}
			} catch {
				// Silently ignore errors during background check
			}
		}

		console.log(`[Trip2g Sync] Badge totals: pull=${totalPull}, push=${totalPush}, conflict=${hasConflict}`);

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
		try {
			const sdk = createSdk(syncDir.apiUrl, syncDir.apiKey, this.manifest.version);
			await sdk.FetchServerHashes();
			return null;
		} catch (error) {
			return (error as Error).message || "Unknown error";
		}
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

	private setSyncing(syncing: boolean): void {
		this.isSyncing = syncing;
		if (this.ribbonIcon) {
			if (syncing) {
				this.ribbonIcon.addClass("is-syncing");
			} else {
				this.ribbonIcon.removeClass("is-syncing");
				// Clear badge after sync completes
				this.ribbonIcon.removeClass("has-pending", "has-pull", "has-push", "has-conflict");
				this.ribbonIcon.setAttribute("aria-label", "Trip2g Sync");
			}
		}
	}

	private setProgress(message: string): void {
		if (this.ribbonIcon) {
			this.ribbonIcon.setAttribute("aria-label", message);
		}
	}

	private async saveAllOpenFiles(): Promise<void> {
		// Force save all open markdown editors
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view as { save?: () => Promise<void> };
			if (view.save) {
				await view.save();
			}
		}
		// Small delay to ensure filesystem write completes
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	async syncDirectory(syncDir: SyncDir): Promise<void> {
		if (!syncDir.path || !syncDir.apiUrl || !syncDir.apiKey) {
			new Notice(t().syncError);
			return;
		}

		if (this.isSyncing) {
			return;
		}

		this.setSyncing(true);

		try {
			// Save all open files before syncing
			await this.saveAllOpenFiles();
		} catch (error) {
			console.error("[Trip2g Sync] Error saving files:", error);
		}

		new Notice(t().syncStarting);
		this.setProgress(t().progressClassifying);

		const sdk = createSdk(syncDir.apiUrl, syncDir.apiKey, this.manifest.version);
		const syncState = this.getSyncState(syncDir.apiUrl);
		const twoWaySync = syncDir.twoWaySync ?? false;
		const publishField = syncDir.publishField || "";

		try {
			// Get folder
			const folder = this.app.vault.getAbstractFileByPath(syncDir.path);
			if (!folder || !(folder instanceof TFolder)) {
				new Notice(`Folder not found: ${syncDir.path}`);
				return;
			}

			// Create environment adapter
			const env = new ObsidianSyncEnv({
				app: this.app,
				sdk,
				folder,
				syncState,
				apiUrl: syncDir.apiUrl,
				apiKey: syncDir.apiKey,
				pluginVersion: this.manifest.version,
				publishField,
				onProgressCallback: (progress: Progress) => {
					const messages: Record<string, string> = {
						pull: t().progressPulling(progress.current, progress.total),
						push: t().progressPushing(progress.current, progress.total),
						upload_asset: t().progressUploadingAssets(progress.current, progress.total),
						download_asset: t().progressDownloadingAssets(progress.current, progress.total),
					};
					this.setProgress(messages[progress.step] || progress.step);
				},
				onConflictCallback: (conflicts: SyncConflictInfo[]) => this.showConflictView(conflicts),
				onAssetConflictCallback: (conflicts: AssetConflictInfo[]) => this.handleAssetConflictsNew(conflicts, twoWaySync),
				onServerDeletedCallback: (paths: string[]) => this.handleServerDeletedNew(paths),
				confirmPushCallback: (paths: string[]) => this.confirmPushNew(paths),
				saveSyncStateCallback: async () => {
					await this.saveSyncStates();
				},
			});

			// Step 1: Classify all files
			console.time("[Trip2g Sync] Classify files");
			const plan = await classifySync(env);
			console.timeEnd("[Trip2g Sync] Classify files");

			// Step 2: Check if this is first sync (migration scenario)
			const isFirstSync = Object.keys(syncState.files).length === 0;

			if (isFirstSync && plan.conflicts.length > 0) {
				// Show migration modal and handle specially
				await this.handleMigrationNew(env, plan, syncState, twoWaySync, publishField);
			} else {
				// Normal sync flow: filter and execute
				const filteredPlan = filterPlan(plan, {
					twoWaySync,
					hasPublishFields: publishField
						? (path: string) => this.hasPublishFieldByPath(path, folder, publishField)
						: undefined,
				});

				console.log(`[Trip2g Sync] Plan: pulls=${filteredPlan.pulls.length}, pushes=${filteredPlan.pushes.length}, conflicts=${filteredPlan.conflicts.length}, localOnly=${filteredPlan.localOnly.length}, unchanged=${filteredPlan.unchanged}`);

				const result = await executePlan(env, filteredPlan, { twoWaySync });

				// Show results
				if (result.pulled > 0) {
					new Notice(t().pulledFiles(result.pulled));
				}
				if (result.pushed > 0) {
					new Notice(t().pushedFiles(result.pushed));
				}
				if (result.assetsUploaded > 0) {
					new Notice(t().assetUploaded(result.assetsUploaded));
				}
				if (result.assetsDownloaded > 0) {
					new Notice(t().assetDownloaded(result.assetsDownloaded));
				}
				if (result.errors.length > 0) {
					console.error("[Trip2g Sync] Errors:", result.errors);
				}
				if (result.pulled === 0 && result.pushed === 0 && result.conflictsResolved === 0 && filteredPlan.unchanged > 0) {
					new Notice(t().allFilesUpToDate);
				}
			}
		} catch (error) {
			console.error("Sync error:", error);
			new Notice(`${t().syncError}: ${(error as Error).message}`);
		} finally {
			this.setSyncing(false);
		}
	}

	/**
	 * Check if a file has any of the publish fields by path.
	 */
	private hasPublishFieldByPath(relativePath: string, folder: TFolder, publishField: string): boolean {
		const fullPath = folder.path === "/" || folder.path === "" ? relativePath : `${folder.path}/${relativePath}`;
		const file = this.app.vault.getAbstractFileByPath(fullPath);
		if (!(file instanceof TFile)) {
			return true; // Non-existent files are considered publishable (for remote_only)
		}
		return this.hasPublishField(file, publishField);
	}

	/**
	 * Handle migration scenario with new sync flow.
	 */
	private async handleMigrationNew(
		env: ObsidianSyncEnv,
		plan: import("./sync/types").SyncPlan,
		syncState: SyncState,
		twoWaySync: boolean,
		publishField: string
	): Promise<void> {
		return new Promise((resolve) => {
			new MigrationModal(this.app, plan.conflicts.length, async (trustServer) => {
				if (trustServer) {
					// Trust server: update lastSyncedHash to remote for all files
					for (const c of plan.classifications) {
						if (c.remoteHash) {
							syncState.files[c.path] = c.remoteHash;
						}
					}

					// Create a plan that only pulls (conflicts become pulls)
					const pullPlan: import("./sync/types").SyncPlan = {
						classifications: [],
						pulls: [...plan.conflicts, ...plan.remoteOnly],
						pushes: [],
						conflicts: [],
						localOnly: [],
						remoteOnly: [],
						localDeleted: [],
						serverDeleted: [],
						unchanged: plan.unchanged,
					};

					const result = await executePlan(env, pullPlan, { twoWaySync });
					new Notice(t().pulledFiles(result.pulled));
				} else {
					// Review each conflict - run normal flow
					const folder = (env as unknown as { folder: TFolder }).folder;
					const filteredPlan = filterPlan(plan, {
						twoWaySync,
						hasPublishFields: publishField
							? (path: string) => this.hasPublishFieldByPath(path, folder, publishField)
							: undefined,
					});

					const result = await executePlan(env, filteredPlan, { twoWaySync });

					if (result.pulled > 0) {
						new Notice(t().pulledFiles(result.pulled));
					}
					if (result.pushed > 0) {
						new Notice(t().pushedFiles(result.pushed));
					}
				}

				await this.saveSyncStates();
				resolve();
			}).open();
		});
	}

	/**
	 * Handle asset conflicts with new flow.
	 */
	private async handleAssetConflictsNew(conflicts: AssetConflictInfo[], twoWaySync: boolean): Promise<AssetConflictResolution[]> {
		if (!twoWaySync) {
			// One-way sync: auto-upload local
			return conflicts.map(() => "keep_local");
		}

		// Two-way sync: show modal for each conflict
		const resolutions: AssetConflictResolution[] = [];
		let remaining = [...conflicts];

		while (remaining.length > 0) {
			const uiConflicts: AssetConflict[] = remaining.map((c) => ({
				path: c.path,
				absolutePath: c.absolutePath,
				relativeAbsolutePath: c.absolutePath, // Will be used for upload
				localHash: c.localHash,
				remoteHash: c.remoteHash,
				remoteUrl: c.remoteUrl,
				noteId: c.noteId,
			}));

			const { resolution, applyToAll } = await new Promise<{ resolution: UIAssetConflictResolution; applyToAll: boolean }>((resolve) => {
				new AssetConflictModal(this.app, uiConflicts, (res, all) => {
					resolve({ resolution: res, applyToAll: all });
				}).open();
			});

			const count = applyToAll ? remaining.length : 1;
			for (let i = 0; i < count; i++) {
				resolutions.push(resolution as AssetConflictResolution);
			}

			remaining = applyToAll ? [] : remaining.slice(1);
		}

		return resolutions;
	}

	/**
	 * Handle server deleted files with new flow.
	 */
	private async handleServerDeletedNew(paths: string[]): Promise<boolean> {
		return new Promise((resolve) => {
			new ServerDeletedModal(this.app, paths, (deleteLocally) => {
				resolve(deleteLocally);
			}).open();
		});
	}

	/**
	 * Confirm push with new flow.
	 */
	private async confirmPushNew(paths: string[]): Promise<boolean> {
		if (this.settings.skipPushConfirmation) {
			return true;
		}

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

			// Two-way sync toggle
			new Setting(containerEl)
				.setName(i18n.twoWaySyncLabel)
				.setDesc(i18n.twoWaySyncDesc)
				.addToggle((toggle) =>
					toggle.setValue(dir.twoWaySync ?? false).onChange(async (value) => {
						this.plugin.settings.syncDirs[dirIndex].twoWaySync = value;
						await this.plugin.saveSettings();
					})
				);
		});

		// Global settings section with visual separator
		new Setting(containerEl).setName(i18n.globalSettingsHeading).setHeading();

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
