import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

/**
 * Modal for handling files deleted on server
 */
export class ServerDeletedModal extends Modal {
	private filePaths: string[];
	private onChoice: (deleteLocally: boolean) => void;

	constructor(app: App, filePaths: string[], onChoice: (deleteLocally: boolean) => void) {
		super(app);
		this.filePaths = filePaths;
		this.onChoice = onChoice;
	}

	onOpen() {
		const { contentEl } = this;
		const i18n = t();

		contentEl.empty();
		contentEl.addClass("sync-server-deleted-modal");

		contentEl.createEl("h2", { text: i18n.serverDeletedTitle });
		contentEl.createEl("p", {
			text: i18n.serverDeletedDescription(this.filePaths.length),
		});

		// Show file list (limited to 20 items)
		const fileListContainer = contentEl.createEl("div", { cls: "sync-file-list" });
		fileListContainer.createEl("p", { text: i18n.serverDeletedFileList, cls: "sync-file-list-header" });
		const fileList = fileListContainer.createEl("ul", { cls: "sync-file-list-items" });

		const displayCount = Math.min(this.filePaths.length, 20);
		for (let i = 0; i < displayCount; i++) {
			fileList.createEl("li", { text: this.filePaths[i] });
		}
		if (this.filePaths.length > 20) {
			fileList.createEl("li", {
				text: `... and ${this.filePaths.length - 20} more`,
				cls: "sync-file-list-more",
			});
		}

		const buttonContainer = contentEl.createEl("div", { cls: "sync-conflict-buttons" });

		const deleteBtn = buttonContainer.createEl("button", {
			text: i18n.deleteLocally,
			cls: "mod-warning",
		});
		deleteBtn.addEventListener("click", () => {
			this.onChoice(true);
			this.close();
		});

		const keepBtn = buttonContainer.createEl("button", {
			text: i18n.keepLocally,
			cls: "mod-cta",
		});
		keepBtn.addEventListener("click", () => {
			this.onChoice(false);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for confirming push to server
 */
export class PushConfirmModal extends Modal {
	private filePaths: string[];
	private onChoice: (proceed: boolean, dontAskAgain: boolean) => void;
	private dontAskAgain: boolean = false;

	constructor(app: App, filePaths: string[], onChoice: (proceed: boolean, dontAskAgain: boolean) => void) {
		super(app);
		this.filePaths = filePaths;
		this.onChoice = onChoice;
	}

	onOpen() {
		const { contentEl } = this;
		const i18n = t();

		contentEl.empty();
		contentEl.addClass("sync-push-confirm-modal");

		contentEl.createEl("h2", { text: i18n.pushConfirmTitle });
		contentEl.createEl("p", {
			text: i18n.pushConfirmDescription(this.filePaths.length),
		});

		// Show file list (limited to 20 items)
		const fileListContainer = contentEl.createEl("div", { cls: "sync-file-list" });
		fileListContainer.createEl("p", { text: i18n.pushConfirmFileList, cls: "sync-file-list-header" });
		const fileList = fileListContainer.createEl("ul", { cls: "sync-file-list-items" });

		const displayCount = Math.min(this.filePaths.length, 20);
		for (let i = 0; i < displayCount; i++) {
			fileList.createEl("li", { text: this.filePaths[i] });
		}
		if (this.filePaths.length > 20) {
			fileList.createEl("li", {
				text: `... and ${this.filePaths.length - 20} more`,
				cls: "sync-file-list-more",
			});
		}

		// Don't ask again checkbox
		new Setting(contentEl)
			.setName(i18n.pushConfirmDontAskAgain)
			.addToggle((toggle) =>
				toggle.setValue(false).onChange((value) => {
					this.dontAskAgain = value;
				})
			);

		const buttonContainer = contentEl.createEl("div", { cls: "sync-conflict-buttons" });

		const proceedBtn = buttonContainer.createEl("button", {
			text: i18n.pushConfirmProceed,
			cls: "mod-cta",
		});
		proceedBtn.addEventListener("click", () => {
			this.onChoice(true, this.dontAskAgain);
			this.close();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: i18n.pushConfirmCancel,
		});
		cancelBtn.addEventListener("click", () => {
			this.onChoice(false, false);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for first-time sync migration
 */
export class MigrationModal extends Modal {
	private conflictCount: number;
	private onChoice: (trustServer: boolean) => void;

	constructor(app: App, conflictCount: number, onChoice: (trustServer: boolean) => void) {
		super(app);
		this.conflictCount = conflictCount;
		this.onChoice = onChoice;
	}

	onOpen() {
		const { contentEl } = this;
		const i18n = t();

		contentEl.empty();
		contentEl.addClass("sync-migration-modal");

		contentEl.createEl("h2", { text: i18n.syncSystemUpdate });
		contentEl.createEl("p", {
			text: i18n.migrationFoundFiles(this.conflictCount),
		});
		contentEl.createEl("p", {
			text: i18n.migrationDescription,
		});

		const buttonContainer = contentEl.createEl("div", { cls: "sync-conflict-buttons" });

		const reviewBtn = buttonContainer.createEl("button", {
			text: i18n.reviewEachConflict,
			cls: "mod-cta",
		});
		reviewBtn.addEventListener("click", () => {
			this.onChoice(false);
			this.close();
		});

		const trustBtn = buttonContainer.createEl("button", {
			text: i18n.trustServerForAll,
		});
		trustBtn.addEventListener("click", () => {
			this.onChoice(true);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
