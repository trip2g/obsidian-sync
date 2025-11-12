import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	ItemView,
	WorkspaceLeaf,
	MarkdownView,
} from "obsidian";
import { FolderSuggest } from "./FolderSuggest";

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

const AI_SUGGESTIONS_VIEW_TYPE = "trip2g-ai-suggestions-view";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Register the AI suggestions view
		this.registerView(AI_SUGGESTIONS_VIEW_TYPE, (leaf) => new AISuggestionsView(leaf, this));

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

		// Add AI suggestions icon
		this.addRibbonIcon("bot", "Trip2g AI Suggestions", async (evt: MouseEvent) => {
			this.activateAISuggestionsView();
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(AI_SUGGESTIONS_VIEW_TYPE);
	}

	async activateAISuggestionsView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(AI_SUGGESTIONS_VIEW_TYPE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use it
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf in the right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: AI_SUGGESTIONS_VIEW_TYPE,
					active: true,
				});
			}
		}

		// Reveal the leaf in case it is in a collapsed sidebar
		if (leaf) {
			workspace.revealLeaf(leaf);
			// Trigger refresh of the view
			const view = leaf.view;
			if (view instanceof AISuggestionsView) {
				await view.refreshSuggestions();
			}
		}
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

		for (const asset of note.assets) {
			try {
				const relativePath = asset.path;
				const serverHash = asset.sha256Hash;

				const absolutePath = this.resolveAssetPath(relativePath, note.path, syncBaseFolder);
				const file = this.app.vault.getAbstractFileByPath(absolutePath);

				if (!file || !(file instanceof TFile)) {
					continue;
				}

				const arrayBuffer = await this.app.vault.readBinary(file);
				const localHash = await this.sha256HashBuffer(arrayBuffer);

				if (!serverHash || serverHash !== localHash) {
					new Notice(`Uploading asset: ${relativePath}`);
					await this.uploadAsset(apiUrl, apiKey, note.id, absolutePath, relativePath, localHash);
				}
			} catch (error) {
				console.error(`Error processing asset ${asset.path}:`, error);
			}
		}
	}

	private resolveAssetPath(relativePath: string, notePath: string, syncBaseFolder?: TFolder): string {
		if (relativePath.startsWith("/")) {
			return relativePath.slice(1);
		}

		if (relativePath.startsWith("./")) {
			const noteDir = notePath.split("/").slice(0, -1).join("/");
			return noteDir ? `${noteDir}/${relativePath.slice(2)}` : relativePath.slice(2);
		}

		if (relativePath.startsWith("../")) {
			const notePathParts = notePath.split("/").slice(0, -1);
			const relativePathParts = relativePath.split("/");

			let i = 0;
			while (i < relativePathParts.length && relativePathParts[i] === "..") {
				notePathParts.pop();
				i++;
			}

			return [...notePathParts, ...relativePathParts.slice(i)].join("/");
		}

		const candidatePaths = [];

		const noteDir = notePath.split("/").slice(0, -1).join("/");
		if (noteDir) {
			candidatePaths.push(`${noteDir}/${relativePath}`);
		}

		if (syncBaseFolder && syncBaseFolder.path) {
			candidatePaths.push(`${syncBaseFolder.path}/${relativePath}`);
		}

		candidatePaths.push(relativePath);

		for (const candidatePath of candidatePaths) {
			const file = this.app.vault.getAbstractFileByPath(candidatePath);
			if (file) {
				return candidatePath;
			}
		}

		return candidatePaths[0] || relativePath;
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
			if (child instanceof TFile && child.extension === "md") {
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

interface AIIssue {
	marker: string;
	fix: string;
	comment: string;
}

class AISuggestionsView extends ItemView {
	plugin: MyPlugin;
	issues: AIIssue[] = [];
	activeFileChangeHandler: () => void;
	refreshTimeout: NodeJS.Timeout | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;

		// Create the event handler with debouncing
		this.activeFileChangeHandler = () => {
			// Clear any existing timeout
			if (this.refreshTimeout) {
				clearTimeout(this.refreshTimeout);
			}

			// Set a new timeout to refresh after 300ms of no changes
			this.refreshTimeout = setTimeout(async () => {
				await this.refreshSuggestions();
			}, 300);
		};
	}

	getViewType() {
		return AI_SUGGESTIONS_VIEW_TYPE;
	}

	getDisplayText() {
		return "AI Suggestions";
	}

	getIcon() {
		return "bot";
	}

	async onOpen() {
		// Register the event listener for active file changes
		this.registerEvent(this.app.workspace.on("active-leaf-change", this.activeFileChangeHandler));

		await this.refreshSuggestions();
	}

	async refreshSuggestions() {
		const { contentEl } = this;
		const activeFile = this.app.workspace.getActiveFile();

		contentEl.empty();
		contentEl.createEl("h4", { text: "AI Suggestions" });

		if (!activeFile || activeFile.extension !== "md") {
			contentEl.createEl("p", {
				text: "Please open a markdown file to see AI suggestions.",
				cls: "ai-suggestions-empty",
			});
			return;
		}

		contentEl.createEl("p", { text: `Analyzing ${activeFile.name}...` });

		try {
			// Read file content
			const content = await this.app.vault.read(activeFile);

			// Send to AI endpoint
			const response = await fetch("http://localhost:8081/debug/demoai", {
				method: "POST",
				headers: {
					"Content-Type": "text/plain",
				},
				body: content,
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			this.issues = data.issues || [];

			// Clear loading message and display results
			contentEl.empty();
			contentEl.createEl("h4", { text: "AI Suggestions" });

			// Add refresh button
			const headerEl = contentEl.createEl("div", {
				cls: "ai-suggestions-header",
			});
			headerEl.style.display = "flex";
			headerEl.style.justifyContent = "space-between";
			headerEl.style.alignItems = "center";
			headerEl.style.marginBottom = "10px";

			headerEl.createEl("p", { text: `File: ${activeFile.name}` });
			const refreshBtn = headerEl.createEl("button", { text: "↻" });
			refreshBtn.style.fontSize = "18px";
			refreshBtn.style.padding = "2px 8px";
			refreshBtn.addEventListener("click", async () => {
				await this.refreshSuggestions();
			});

			if (this.issues.length === 0) {
				contentEl.createEl("p", { text: "No issues found!" });
				return;
			}

			// Display issues
			const issuesContainer = contentEl.createEl("div", {
				cls: "ai-issues-container",
			});
			issuesContainer.style.overflowY = "auto";

			this.issues.forEach((issue, index) => {
				const issueEl = issuesContainer.createEl("div", {
					cls: "ai-issue-item",
				});
				issueEl.style.marginBottom = "10px";
				issueEl.style.padding = "8px";
				issueEl.style.border = "1px solid var(--background-modifier-border)";
				issueEl.style.borderRadius = "4px";
				issueEl.style.fontSize = "0.9em";

				// Issue marker
				const markerEl = issueEl.createEl("div", { cls: "ai-issue-marker" });
				markerEl.createEl("strong", { text: "Found: " });
				markerEl.createEl("code", { text: issue.marker });
				markerEl.style.marginBottom = "4px";

				// Fix suggestion
				const fixEl = issueEl.createEl("div", { cls: "ai-issue-fix" });
				fixEl.createEl("strong", { text: "Fix: " });
				fixEl.createEl("code", { text: issue.fix });
				fixEl.style.marginBottom = "4px";

				// Comment
				const commentEl = issueEl.createEl("div", { cls: "ai-issue-comment" });
				commentEl.createEl("em", { text: issue.comment });
				commentEl.style.marginBottom = "8px";
				commentEl.style.color = "var(--text-muted)";
				commentEl.style.fontSize = "0.9em";

				// Buttons container
				const buttonsEl = issueEl.createEl("div", { cls: "ai-issue-buttons" });
				buttonsEl.style.display = "flex";
				buttonsEl.style.gap = "5px";

				// Show button
				const showBtn = buttonsEl.createEl("button", { text: "Show" });
				showBtn.style.fontSize = "0.9em";
				showBtn.addEventListener("click", async () => {
					await this.showMarkerInEditor(activeFile, issue.marker);
				});

				// Fix button
				const fixBtn = buttonsEl.createEl("button", { text: "Apply Fix" });
				fixBtn.style.fontSize = "0.9em";
				fixBtn.addEventListener("click", async () => {
					await this.applyFix(activeFile, issue);
					fixBtn.disabled = true;
					fixBtn.textContent = "Fixed!";
					new Notice(`Replaced "${issue.marker}" with "${issue.fix}"`);
				});
			});

			// Add "Fix All" button if multiple issues
			if (this.issues.length > 1) {
				const fixAllBtn = contentEl.createEl("button", {
					text: "Fix All Issues",
					cls: "mod-cta",
				});
				fixAllBtn.style.marginTop = "10px";
				fixAllBtn.style.width = "100%";
				fixAllBtn.addEventListener("click", async () => {
					await this.applyAllFixes(activeFile);
					fixAllBtn.disabled = true;
					fixAllBtn.textContent = "All Fixed!";
					new Notice(`Fixed ${this.issues.length} issues`);
					await this.refreshSuggestions();
				});
			}
		} catch (error) {
			contentEl.empty();
			contentEl.createEl("h4", { text: "AI Suggestions" });
			contentEl.createEl("p", { text: `Error: ${error.message}` });
			console.error("AI suggestions error:", error);
		}
	}

	async showMarkerInEditor(file: TFile, marker: string) {
		// Get the active editor
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		if (!activeLeaf) return;

		// Make sure we're viewing the correct file
		const viewState = activeLeaf.getViewState();
		if (viewState.type !== "markdown" || viewState.state?.file !== file.path) {
			// Open the file if it's not already open
			await activeLeaf.openFile(file);
		}

		// Get the editor
		const editor = activeLeaf.view instanceof MarkdownView ? activeLeaf.view.editor : null;

		if (!editor) {
			new Notice("Could not access the editor");
			return;
		}

		// Get the content to find the marker position
		const content = editor.getValue();
		const markerIndex = content.indexOf(marker);

		if (markerIndex === -1) {
			new Notice(`Could not find "${marker}" in the file`);
			return;
		}

		// Calculate line and character position
		const lines = content.substring(0, markerIndex).split("\n");
		const line = lines.length - 1;
		const ch = lines[lines.length - 1].length;

		// Create position objects
		const from = { line, ch };
		const to = { line, ch: ch + marker.length };

		// Set selection and scroll to it
		editor.setSelection(from, to);
		editor.scrollIntoView({ from, to }, true);

		// Focus the editor
		editor.focus();
	}

	async applyFix(file: TFile, issue: AIIssue) {
		const content = await this.app.vault.read(file);
		const newContent = content.replace(issue.marker, issue.fix);
		await this.app.vault.modify(file, newContent);
	}

	async applyAllFixes(file: TFile) {
		let content = await this.app.vault.read(file);
		for (const issue of this.issues) {
			content = content.replace(issue.marker, issue.fix);
		}
		await this.app.vault.modify(file, content);
	}

	async onClose() {
		// Clear any pending refresh
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
		}
		// Event listeners are automatically cleaned up by ItemView
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
