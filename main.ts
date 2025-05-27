import { ItemView, WorkspaceLeaf, App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { FolderSuggest } from './FolderSuggest'

// Remember to rename these classes and interfaces!

type SyncDir = {
	path: string;
	apiKey: string;
	apiUrl: string;
}

interface MyPluginSettings {
	syncDirs: SyncDir[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	syncDirs: [],
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_MAIN);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (leaf)
				await leaf.setViewState({ type: VIEW_TYPE_MAIN, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		if (leaf)
			workspace.revealLeaf(leaf);
	}

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_MAIN,
			(leaf) => new MainView(leaf)
		);

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Trip2g', (evt: MouseEvent) => {
			this.activateView()
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');
		//
		// // This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-sample-modal-simple',
		// 	name: 'Open sample modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });
		// // This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection('Sample Editor Command');
		// 	}
		// });
		// // This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}
		//
		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	}
		// });
		//
		// // This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
		//
		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });
		//
		// // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
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

		new Setting(this.containerEl).setName("Template hotkeys").setHeading();

		const desc = document.createDocumentFragment();
		desc.append(
			"You can sync multiple directories to multiple remote apps."
		);

		new Setting(this.containerEl).setDesc(desc);

		new Setting(this.containerEl).addButton(button => {
			button
				.setButtonText("Add sync directory")
				.setCta()
				.onClick(() => {
					this.plugin.settings.syncDirs.push({
						path: "",
						apiKey: "",
						apiUrl: "",
					})
					this.plugin.saveSettings();
					// Force refresh
					this.display();
				})
			});


		this.plugin.settings.syncDirs.forEach((dir, dirIndex) => {
			const s = new Setting(this.containerEl)
			s.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);

				cb.setPlaceholder("Example: folder1/folder2")
					.setValue(dir.path)
					.onChange((newPath) => {
						this.plugin.settings.syncDirs[dirIndex].path = newPath;
						this.plugin.saveSettings();
					})
			})

			s.addText((text) => {
				text.setPlaceholder("API URL")
					.setValue(dir.apiUrl)
					.onChange((newApiUrl) => {
						this.plugin.settings.syncDirs[dirIndex].apiUrl = newApiUrl;
						this.plugin.saveSettings();
					});
			});

			s.addText((text) => {
				text.setPlaceholder("API Key")
					.setValue(dir.apiKey)
					.onChange((newApiKey) => {
						this.plugin.settings.syncDirs[dirIndex].apiKey = newApiKey;
						this.plugin.saveSettings();
					});
			})

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

export const VIEW_TYPE_MAIN = 'trip2g-main-view';

export class MainView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_MAIN;
	}

	getDisplayText() {
		return 'Trip2g';
	}

	async onOpen() {
		this.containerEl.empty();

		import('./web.js').then(() => {
			this.containerEl.empty();

			console.log($trip2g_obsidian.Root)

			const div = document.createElement('div');
			div.style.height = '100%';
			div.style.overflowY = 'auto';
			this.containerEl.appendChild(div);

			const view = $trip2g_obsidian.Root(0); // @ts-ignore
			view.app(this.app);
			view.dom_node(div)
			view.autorun();

			console.log('runned');
		})
	}

	async onClose() {
		// Nothing to clean up.
	}
}
