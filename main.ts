import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { FolderSuggest } from './FolderSuggest'

// Remember to rename these classes and interfaces!

type SyncDir = {
	path: string;
	apiKey: string;
	apiUrl: string;
	error?: string;
}

interface MyPluginSettings {
	syncDirs: SyncDir[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	syncDirs: [],
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;


	async onload() {
		await this.loadSettings();


			// This creates an icon in the left ribbon.
		this.addRibbonIcon('sync', 'Trip2g Sync', (evt: MouseEvent) => {
			if (this.settings.syncDirs.length === 0) {
				new Notice('No sync directories configured. Please add one in settings first.');
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

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


	private async sha256Hash(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = new Uint8Array(hashBuffer);
		return btoa(String.fromCharCode(...hashArray)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
	}

	async testConnection(syncDir: SyncDir): Promise<string | null> {
		try {
			const hashes = await this.fetchServerHashes(syncDir.apiUrl, syncDir.apiKey);
			return null; // No error
		} catch (error) {
			return error.message || 'Unknown error';
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
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': apiKey,
				},
				body: JSON.stringify({ query })
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();

			if (data.errors) {
				console.error('GraphQL errors:', data.errors);
				new Notice(`GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
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
			console.error('Error fetching server hashes:', error);
			new Notice(`Error fetching server hashes: ${error.message}`);
			return {};
		}
	}

	private extractAssetPaths(content: string): string[] {
		const assetPaths: string[] = [];
		// Match image references: ![alt](path) and [[path]]
		const imageRegex = /!\[.*?\]\(([^)]+)\)|!\[\[([^\]]+)\]\]/g;
		let match;
		
		while ((match = imageRegex.exec(content)) !== null) {
			const path = match[1] || match[2];
			if (path && !path.startsWith('http')) {
				assetPaths.push(path);
			}
		}
		
		return assetPaths;
	}

	private async uploadAsset(apiUrl: string, apiKey: string, noteId: string, assetPath: string, relativePath: string, sha256Hash: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(assetPath);
			if (!file || !(file instanceof TFile)) {
				console.warn(`Asset not found: ${assetPath}`);
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
						absolutePath: assetPath
					}
				},
				query: `mutation($input: UploadNoteAssetInput!) { 
					uploadNoteAsset(input: $input) { 
						... on ErrorPayload { 
							message 
						} 
						... on UploadNoteAssetPayload { 
							uploadSkipped 
						} 
					} 
				}`
			});

			const map = JSON.stringify({ "0": ["variables.input.file"] });

			const formData = new FormData();
			formData.append('operations', operations);
			formData.append('map', map);
			formData.append('0', blob, file.name);

			const response = await fetch(`${apiUrl}/graphql`, {
				method: 'POST',
				headers: {
					'X-API-Key': apiKey,
				},
				body: formData
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			if (result.errors) {
				console.error(`Asset upload error for ${relativePath}:`, result.errors);
			}
		} catch (error) {
			console.error(`Failed to upload asset ${relativePath}:`, error);
		}
	}

	private async pushUpdatesGraphql(apiUrl: string, apiKey: string, updates: Array<{path: string, content: string}>): Promise<void> {
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
				updates: updates
			}
		};

		try {
			const response = await fetch(`${apiUrl}/graphql`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': apiKey,
				},
				body: JSON.stringify({ query, variables })
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			
			if (result.errors) {
				console.error('GraphQL errors:', result.errors);
				new Notice(`GraphQL error: ${result.errors[0]?.message || 'Unknown error'}`);
			} else {
				const pushResult = result.data?.pushNotes;
				if (pushResult?.notes) {
					new Notice(`✅ Successfully synced ${updates.length} files`);
					
					// Process assets for each note
					for (const note of pushResult.notes) {
						const update = updates.find(u => u.path === note.path);
						if (update) {
							await this.processNoteAssets(apiUrl, apiKey, note, update.content);
						}
					}
				}
			}
		} catch (error) {
			console.error('Error pushing updates:', error);
			new Notice(`Error pushing updates: ${error.message}`);
		}
	}

	private async processNoteAssets(apiUrl: string, apiKey: string, note: any, content: string): Promise<void> {
		const assetPaths = this.extractAssetPaths(content);
		if (assetPaths.length === 0) return;

		// Get existing assets from server
		const existingAssets = new Map<string, string>();
		if (note.assets) {
			for (const asset of note.assets) {
				existingAssets.set(asset.path, asset.sha256Hash);
			}
		}

		for (const relativePath of assetPaths) {
			try {
				// Resolve absolute path from relative path in note content
				const absolutePath = this.resolveAssetPath(relativePath, note.path);
				const file = this.app.vault.getAbstractFileByPath(absolutePath);
				
				if (!file || !(file instanceof TFile)) {
					console.warn(`Asset not found: ${absolutePath} (from ${relativePath})`);
					continue;
				}

				// Calculate hash of local asset
				const arrayBuffer = await this.app.vault.readBinary(file);
				const localHash = await this.sha256HashBuffer(arrayBuffer);
				
				// Check if asset needs to be uploaded
				const existingHash = existingAssets.get(relativePath);
				if (existingHash !== localHash) {
					console.log(`Uploading asset: ${relativePath} (${localHash})`);
					await this.uploadAsset(apiUrl, apiKey, note.id, absolutePath, relativePath, localHash);
				} else {
					console.log(`Asset up to date: ${relativePath}`);
				}
			} catch (error) {
				console.error(`Error processing asset ${relativePath}:`, error);
			}
		}
	}

	private resolveAssetPath(relativePath: string, notePath: string): string {
		// If path starts with '/', it's absolute from vault root
		if (relativePath.startsWith('/')) {
			return relativePath.slice(1);
		}
		
		// If path starts with './', resolve relative to note directory
		if (relativePath.startsWith('./')) {
			const noteDir = notePath.split('/').slice(0, -1).join('/');
			return noteDir ? `${noteDir}/${relativePath.slice(2)}` : relativePath.slice(2);
		}
		
		// If path starts with '../', resolve relative to parent directories
		if (relativePath.startsWith('../')) {
			const notePathParts = notePath.split('/').slice(0, -1);
			const relativePathParts = relativePath.split('/');
			
			let i = 0;
			while (i < relativePathParts.length && relativePathParts[i] === '..') {
				notePathParts.pop();
				i++;
			}
			
			return [...notePathParts, ...relativePathParts.slice(i)].join('/');
		}
		
		// Otherwise, assume relative to note directory
		const noteDir = notePath.split('/').slice(0, -1).join('/');
		return noteDir ? `${noteDir}/${relativePath}` : relativePath;
	}

	private async sha256HashBuffer(buffer: ArrayBuffer): Promise<string> {
		const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
		const hashArray = new Uint8Array(hashBuffer);
		return btoa(String.fromCharCode(...hashArray)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
	}

	async syncDirectory(syncDir: SyncDir): Promise<void> {
		if (!syncDir.path || !syncDir.apiUrl || !syncDir.apiKey) {
			new Notice('Sync directory configuration is incomplete');
			return;
		}

		new Notice('Starting sync...');

		try {
			const serverHashes = await this.fetchServerHashes(syncDir.apiUrl, syncDir.apiKey);
			const serverEmpty = Object.keys(serverHashes).length === 0;
			const updates: Array<{path: string, content: string}> = [];

			const folder = this.app.vault.getAbstractFileByPath(syncDir.path);
			if (!folder || !(folder instanceof TFolder)) {
				new Notice(`Folder not found: ${syncDir.path}`);
				return;
			}

			const files = this.getAllMarkdownFiles(folder);
			
			for (const file of files) {
				const content = await this.app.vault.read(file);
				const localHash = await this.sha256Hash(content);
				const relativePath = this.getRelativePath(file, folder);
				const remoteHash = serverHashes[relativePath];

				console.log(`${relativePath}: local=${localHash}, remote=${remoteHash || '—'}`);

				if (serverEmpty || remoteHash !== localHash) {
					updates.push({
						path: relativePath,
						content: content
					});
				}
			}

			if (updates.length > 0) {
				await this.pushUpdatesGraphql(syncDir.apiUrl, syncDir.apiKey, updates);
			} else {
				new Notice('✅ All files are up to date');
			}

		} catch (error) {
			console.error('Sync error:', error);
			new Notice(`Sync error: ${error.message}`);
		}
	}

	private getAllMarkdownFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
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
		contentEl.createEl('h2', { text: 'Select sync directory' });

		if (this.plugin.settings.syncDirs.length === 0) {
			contentEl.createEl('p', { text: 'No sync directories configured. Please add one in settings first.' });
			const settingsBtn = contentEl.createEl('button', { text: 'Open Settings' });
			settingsBtn.addEventListener('click', () => {
				this.close();
				// @ts-ignore
				this.app.setting.open();
				// @ts-ignore
				this.app.setting.openTabById(this.plugin.manifest.id);
			});
			return;
		}

		this.plugin.settings.syncDirs.forEach((dir, index) => {
			const dirEl = contentEl.createEl('div', { cls: 'sync-dir-item' });
			dirEl.createEl('h3', { text: dir.path || `Directory ${index + 1}` });
			dirEl.createEl('p', { text: `API URL: ${dir.apiUrl}` });
			
			const syncBtn = dirEl.createEl('button', { text: 'Sync this directory' });
			syncBtn.addEventListener('click', async () => {
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
		desc.append(
			"You can sync multiple directories to multiple remote apps."
		);

		new Setting(this.containerEl).setDesc(desc);

		const buttonsContainer = new Setting(this.containerEl);
		buttonsContainer.addButton(button => {
			button
				.setButtonText("Add sync directory")
				.setCta()
				.onClick(() => {
					this.plugin.settings.syncDirs.push({
						path: "",
						apiKey: "",
						apiUrl: "",
						error: undefined,
					})
					this.plugin.saveSettings();
					// Force refresh
					this.display();
				})
			});

		if (this.plugin.settings.syncDirs.length > 0) {
			buttonsContainer.addButton(button => {
				button
					.setButtonText("Test all connections")
					.onClick(async () => {
						for (let i = 0; i < this.plugin.settings.syncDirs.length; i++) {
							const dir = this.plugin.settings.syncDirs[i];
							const error = await this.plugin.testConnection(dir);
							this.plugin.settings.syncDirs[i].error = error;
						}
						this.plugin.saveSettings();
						this.display();
					})
			});
		}


		this.plugin.settings.syncDirs.forEach((dir, dirIndex) => {
			const s = new Setting(this.containerEl)
			s.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);

				cb.setPlaceholder("Example: folder1/folder2")
					.setValue(dir.path)
					.onChange((newPath) => {
						this.plugin.settings.syncDirs[dirIndex].path = newPath;
						this.plugin.settings.syncDirs[dirIndex].error = undefined;
						this.plugin.saveSettings();
					})
			})

			s.addText((text) => {
				text.setPlaceholder("API URL")
					.setValue(dir.apiUrl)
					.onChange((newApiUrl) => {
						this.plugin.settings.syncDirs[dirIndex].apiUrl = newApiUrl;
						this.plugin.settings.syncDirs[dirIndex].error = undefined;
						this.plugin.saveSettings();
					});
			});

			s.addText((text) => {
				text.setPlaceholder("API Key")
					.setValue(dir.apiKey)
					.onChange((newApiKey) => {
						this.plugin.settings.syncDirs[dirIndex].apiKey = newApiKey;
						this.plugin.settings.syncDirs[dirIndex].error = undefined;
						this.plugin.saveSettings();
					});
			})

			s.addExtraButton((button) => {
				button
					.setIcon("wifi")
					.setTooltip("Test connection")
					.onClick(async () => {
						const error = await this.plugin.testConnection(dir);
						this.plugin.settings.syncDirs[dirIndex].error = error;
						this.plugin.saveSettings();
						this.display();
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
				const errorEl = this.containerEl.createEl('div', {
					cls: 'setting-item-description',
					text: `❌ Error: ${dir.error}`
				});
				errorEl.style.color = 'var(--text-error)';
				errorEl.style.marginTop = '5px';
			} else if (dir.error === null) {
				const successEl = this.containerEl.createEl('div', {
					cls: 'setting-item-description',
					text: '✅ Connection successful'
				});
				successEl.style.color = 'var(--text-success)';
				successEl.style.marginTop = '5px';
			}
		})

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

