import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
} from "obsidian";
import { FolderSuggest } from "./FolderSuggest";
import { TelegramEmojiManager } from "./telegramEmoji";

// Remember to rename these classes and interfaces!

type SyncDir = {
	path: string;
	apiKey: string;
	apiUrl: string;
	error?: string | null;
};

type NoteAsset = {
	path: string;
	sha256Hash: string;
};

type NoteWithAssets = {
	id: string;
	path: string;
	assets?: NoteAsset[];
};

interface MyPluginSettings {
	syncDirs: SyncDir[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	syncDirs: [],
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	emojiManagers: TelegramEmojiManager[] = [];

	async onload() {
		await this.loadSettings();

		// Initialize emoji managers for all configured sync directories
		this.initEmojiManagers();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon("sync", "Trip2g Sync", (evt: MouseEvent) => {
			if (this.settings.syncDirs.length === 0) {
				new Notice("No sync directories configured. Please add one in settings first.");
			} else if (this.settings.syncDirs.length === 1) {
				this.syncDirectory(this.settings.syncDirs[0]);
			} else {
				new SyncDirectoryModal(this.app, this).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup all emoji managers
		for (const manager of this.emojiManagers) {
			manager.cleanup();
		}
		this.emojiManagers = [];
	}

	private initEmojiManagers() {
		// Cleanup existing managers
		for (const manager of this.emojiManagers) {
			manager.cleanup();
		}
		this.emojiManagers = [];

		// Create new managers for each configured sync directory
		for (const syncDir of this.settings.syncDirs) {
			if (syncDir.apiUrl && syncDir.apiKey) {
				const manager = new TelegramEmojiManager(
					this.app,
					syncDir.apiUrl,
					syncDir.apiKey
				);
				manager.register(this);
				this.emojiManagers.push(manager);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Reinitialize emoji managers when settings change
		this.initEmojiManagers();
	}

	private async sha256Hash(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = new Uint8Array(hashBuffer);
		return btoa(String.fromCharCode(...hashArray))
			.replace(/\+/g, "-")
			.replace(/\//g, "_");
	}

	async testConnection(syncDir: SyncDir): Promise<string | null> {
		try {
			await this.fetchServerHashes(syncDir.apiUrl, syncDir.apiKey);
			return null; // No error
		} catch (error) {
			return error.message || "Unknown error";
		}
	}

	private async fetchServerHashes(apiUrl: string, apiKey: string): Promise<Record<string, string>> {
		const query = `
			query {
				notePaths {
					path: value
					hash: latestContentHash
				}
			}
		`;

		try {
			const response = await fetch(`${apiUrl}/graphql`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify({ query }),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();

			if (data.errors) {
				console.error("GraphQL errors:", data.errors);
				new Notice(`GraphQL error: ${data.errors[0]?.message || "Unknown error"}`);
				return {};
			}

			const result = data.data?.notePaths || [];
			const hashes: Record<string, string> = {};

			for (const item of result) {
				if (item.path && item.hash) {
					hashes[item.path] = item.hash;
				}
			}

			return hashes;
		} catch (error) {
			console.error("Error fetching server hashes:", error);
			new Notice(`Error fetching server hashes: ${error.message}`);
			return {};
		}
	}

	private async uploadAsset(
		apiUrl: string,
		apiKey: string,
		noteId: string,
		assetPath: string,
		relativePath: string,
		sha256Hash: string
	): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(assetPath);
			if (!file || !(file instanceof TFile)) {
				return;
			}

			const arrayBuffer = await this.app.vault.readBinary(file);
			const blob = new Blob([arrayBuffer]);

			const operations = JSON.stringify({
				variables: {
					input: {
						file: null,
						noteId: noteId,
						sha256Hash: sha256Hash,
						path: relativePath,
						absolutePath: assetPath,
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
			formData.append("0", blob, file.name);

			const response = await fetch(`${apiUrl}/graphql`, {
				method: "POST",
				headers: {
					"X-API-Key": apiKey,
				},
				body: formData,
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			if (result.errors) {
				console.error(`Asset upload error for ${relativePath}:`, result.errors);
				return;
			}

			const payload = result.data?.uploadNoteAsset;
			if (payload?.__typename === "ErrorPayload") {
				new Notice(`Asset upload failed: ${payload.message}`);
			} else if (payload?.__typename === "UploadNoteAssetPayload" && !payload.uploadSkipped) {
				new Notice(`✅ Asset uploaded: ${relativePath}`);
			}
		} catch (error) {
			console.error(`Failed to upload asset ${relativePath}:`, error);
		}
	}

	private async hideNotesGraphql(apiUrl: string, apiKey: string, paths: string[]): Promise<boolean> {
		const query = `
			mutation HideNotes($input: HideNotesInput!) {
				hideNotes(input: $input) {
					... on HideNotesPayload {
						success
					}
					... on ErrorPayload {
						message
					}
				}
			}
		`;

		const variables = {
			input: {
				paths: paths,
			},
		};

		try {
			const response = await fetch(`${apiUrl}/graphql`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify({ query, variables }),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.errors) {
				console.error("GraphQL errors hiding notes:", result.errors);
				new Notice(`Error hiding notes: ${result.errors[0]?.message || "Unknown error"}`);
				return false;
			} else {
				const hideResult = result.data?.hideNotes;
				if (hideResult?.message) {
					new Notice(`Error hiding notes: ${hideResult.message}`);
					return false;
				} else if (hideResult?.success) {
					new Notice(`✅ Successfully hid ${paths.length} notes`);
					return true;
				}
			}
		} catch (error) {
			console.error("Error hiding notes:", error);
			new Notice(`Error hiding notes: ${error.message}`);
			return false;
		}

		return false;
	}

	private async pushUpdatesGraphql(
		apiUrl: string,
		apiKey: string,
		updates: Array<{ path: string; content: string }>,
		syncBaseFolder?: TFolder
	): Promise<void> {
		const query = `
			mutation PushNotes($input: PushNotesInput!) {
				pushNotes(input: $input) {
					... on ErrorPayload {
						message
					}
					... on PushNotesPayload {
						notes {
							id
							path
							assets {
								path
								sha256Hash
							}
						}
					}
				}
			}
		`;

		const variables = {
			input: {
				updates: updates,
			},
		};

		try {
			const response = await fetch(`${apiUrl}/graphql`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify({ query, variables }),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.errors) {
				console.error("GraphQL errors:", result.errors);
				new Notice(`GraphQL error: ${result.errors[0]?.message || "Unknown error"}`);
			} else {
				const pushResult = result.data?.pushNotes;
				if (pushResult?.notes) {
					new Notice(`✅ Successfully synced ${updates.length} files`);

					// Process assets for each note
					for (const note of pushResult.notes) {
						await this.processNoteAssets(apiUrl, apiKey, note, syncBaseFolder);
					}
				}
			}
		} catch (error) {
			console.error("Error pushing updates:", error);
			new Notice(`Error pushing updates: ${error.message}`);
		}
	}

	private async processNoteAssets(
		apiUrl: string,
		apiKey: string,
		note: NoteWithAssets,
		syncBaseFolder?: TFolder
	): Promise<void> {
		if (!note.assets || note.assets.length === 0) {
			return;
		}

		// Get the note file for source path context
		let notePathInVault = note.path;
		if (syncBaseFolder && syncBaseFolder.path && syncBaseFolder.path !== "/") {
			notePathInVault = `${syncBaseFolder.path}/${note.path}`;
		}

		const noteFile = this.app.vault.getAbstractFileByPath(notePathInVault);

		if (!noteFile || !(noteFile instanceof TFile)) {
			console.warn(`Note file not found for asset resolution: ${notePathInVault}`);
			return;
		}

		for (const asset of note.assets) {
			try {
				const relativePath = asset.path;
				const serverHash = asset.sha256Hash;

				// Use Obsidian's built-in link resolution
				const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
					relativePath,
					noteFile.path
				);

				if (!resolvedFile || !(resolvedFile instanceof TFile)) {
					console.warn(`Asset not found: ${relativePath} (from ${noteFile.path})`);
					continue;
				}

				const arrayBuffer = await this.app.vault.readBinary(resolvedFile);
				const localHash = await this.sha256HashBuffer(arrayBuffer);

				if (!serverHash || serverHash !== localHash) {
					new Notice(`Uploading asset: ${relativePath}`);
					await this.uploadAsset(
						apiUrl,
						apiKey,
						note.id,
						resolvedFile.path,
						relativePath,
						localHash
					);
				}
			} catch (error) {
				console.error(`Error processing asset ${asset.path}:`, error);
			}
		}
	}

	private async sha256HashBuffer(buffer: ArrayBuffer): Promise<string> {
		const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
		const hashArray = new Uint8Array(hashBuffer);
		return Array.from(hashArray)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	async syncDirectory(syncDir: SyncDir): Promise<void> {
		if (!syncDir.path || !syncDir.apiUrl || !syncDir.apiKey) {
			new Notice("Sync directory configuration is incomplete");
			return;
		}

		new Notice("Starting sync...");

		try {
			const serverHashes = await this.fetchServerHashes(syncDir.apiUrl, syncDir.apiKey);
			const serverEmpty = Object.keys(serverHashes).length === 0;
			const updates: Array<{ path: string; content: string }> = [];

			const folder = this.app.vault.getAbstractFileByPath(syncDir.path);
			if (!folder || !(folder instanceof TFolder)) {
				new Notice(`Folder not found: ${syncDir.path}`);
				return;
			}

			const files = this.getAllMarkdownFiles(folder);
			const localPaths = new Set<string>();

			for (const file of files) {
				const content = await this.app.vault.read(file);
				const localHash = await this.sha256Hash(content);
				const relativePath = this.getRelativePath(file, folder);
				localPaths.add(relativePath);
				const remoteHash = serverHashes[relativePath];

				if (serverEmpty || remoteHash !== localHash) {
					updates.push({
						path: relativePath,
						content: content,
					});
				}
			}

			// Find server notes that don't exist locally (should be hidden)
			const serverOnlyPaths: string[] = [];
			for (const serverPath of Object.keys(serverHashes)) {
				if (!localPaths.has(serverPath)) {
					serverOnlyPaths.push(serverPath);
				}
			}

			// Always send PushNotes mutation to get asset information
			await this.pushUpdatesGraphql(syncDir.apiUrl, syncDir.apiKey, updates, folder);

			if (updates.length === 0) {
				new Notice("✅ All files are up to date");
			}

			// Hide notes that exist on server but not locally
			if (serverOnlyPaths.length > 0) {
				new Notice(`🙈 Hiding ${serverOnlyPaths.length} notes that don't exist locally...`);
				await this.hideNotesGraphql(syncDir.apiUrl, syncDir.apiKey, serverOnlyPaths);
			}
		} catch (error) {
			console.error("Sync error:", error);
			new Notice(`Sync error: ${error.message}`);
		}
	}

	private shouldExcludeFile(filePath: string): boolean {
		// Exclude files in _layouts/*/node_modules
		if (filePath.startsWith("_layouts/") && filePath.includes("/node_modules/")) {
			return true;
		}
		return false;
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
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Select sync directory" });

		if (this.plugin.settings.syncDirs.length === 0) {
			contentEl.createEl("p", {
				text: "No sync directories configured. Please add one in settings first.",
			});
			const settingsBtn = contentEl.createEl("button", {
				text: "Open Settings",
			});
			settingsBtn.addEventListener("click", () => {
				this.close();
				// @ts-ignore
				this.app.setting.open();
				// @ts-ignore
				this.app.setting.openTabById(this.plugin.manifest.id);
			});
			return;
		}

		this.plugin.settings.syncDirs.forEach((dir, index) => {
			const dirEl = contentEl.createEl("div", { cls: "sync-dir-item" });
			dirEl.createEl("h3", { text: dir.path || `Directory ${index + 1}` });
			dirEl.createEl("p", { text: `API URL: ${dir.apiUrl}` });

			const syncBtn = dirEl.createEl("button", { text: "Sync this directory" });
			syncBtn.addEventListener("click", async () => {
				this.close();
				await this.plugin.syncDirectory(dir);
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(this.containerEl).setName("Settings").setHeading();

		const desc = document.createDocumentFragment();
		desc.append("You can sync multiple directories to multiple remote apps.");

		new Setting(this.containerEl).setDesc(desc);

		const buttonsContainer = new Setting(this.containerEl);
		buttonsContainer.addButton((button) => {
			button
				.setButtonText("Add sync directory")
				.setCta()
				.onClick(() => {
					this.plugin.settings.syncDirs.push({
						path: "/",
						apiKey: "",
						apiUrl: "",
						error: undefined,
					});
					this.plugin.saveSettings();
					// Force refresh
					this.display();
				});
		});

		if (this.plugin.settings.syncDirs.length > 0) {
			buttonsContainer.addButton((button) => {
				button.setButtonText("Test all connections").onClick(async () => {
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
					if (failCount === 0) {
						new Notice(`✅ All connections successful (${successCount})`);
					} else {
						new Notice(`⚠️ ${successCount} successful, ${failCount} failed`);
					}
				});
			});
		}

		this.plugin.settings.syncDirs.forEach((dir, dirIndex) => {
			const s = new Setting(this.containerEl);
			s.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);

				cb.setPlaceholder("Path to folder (/ for vault root)")
					.setValue(dir.path)
					.onChange((newPath) => {
						this.plugin.settings.syncDirs[dirIndex].path = newPath;
						this.plugin.settings.syncDirs[dirIndex].error = undefined;
						this.plugin.saveSettings();
					});
			});

			s.addText((text) => {
				text
					.setPlaceholder("API URL")
					.setValue(dir.apiUrl)
					.onChange((newApiUrl) => {
						this.plugin.settings.syncDirs[dirIndex].apiUrl = newApiUrl;
						this.plugin.settings.syncDirs[dirIndex].error = undefined;
						this.plugin.saveSettings();
					});
			});

			s.addText((text) => {
				text
					.setPlaceholder("API Key")
					.setValue(dir.apiKey)
					.onChange((newApiKey) => {
						this.plugin.settings.syncDirs[dirIndex].apiKey = newApiKey;
						this.plugin.settings.syncDirs[dirIndex].error = undefined;
						this.plugin.saveSettings();
					});
			});

			s.addExtraButton((button) => {
				button
					.setIcon("wifi")
					.setTooltip("Test connection")
					.onClick(async () => {
						const error = await this.plugin.testConnection(dir);
						this.plugin.settings.syncDirs[dirIndex].error = error;
						this.plugin.saveSettings();
						this.display();
						if (error === null) {
							new Notice("✅ Connection successful");
						} else {
							new Notice(`❌ Connection failed: ${error}`);
						}
					});
			});

			s.addExtraButton((button) => {
				button
					.setIcon("cross")
					.setTooltip("Remove sync directory")
					.onClick(() => {
						this.plugin.settings.syncDirs.splice(dirIndex, 1);
						this.plugin.saveSettings();
						// Force refresh
						this.display();
					});
			});

			// Show error message if exists
			if (dir.error) {
				const errorEl = this.containerEl.createEl("div", {
					cls: "setting-item-description",
					text: `❌ Error: ${dir.error}`,
				});
				errorEl.style.color = "var(--text-error)";
				errorEl.style.marginTop = "5px";
			}
		});

		// new Setting(containerEl)
		// 	.setName('Setting #11')
		// 	.setDesc('It\'s a secret')
		// 	.addText(text => text
		// 		.setPlaceholder('Enter your secret')
		// 		.setValue(this.plugin.settings.mySetting)
		// 		.onChange(async (value) => {
		// 			this.plugin.settings.mySetting = value;
		// 			await this.plugin.saveSettings();
		// 		}));
	}
}
