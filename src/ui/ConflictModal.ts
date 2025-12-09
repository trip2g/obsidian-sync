import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

/**
 * Modal for handling files deleted on server
 */
export class ServerDeletedModal extends Modal {
	private filePaths: string[];
	private onChoice: (deleteLocally: boolean) => void;
	private resolved: boolean = false;

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

		// Show file list
		const fileListContainer = contentEl.createEl("div", { cls: "sync-file-list" });
		fileListContainer.createEl("p", { text: i18n.serverDeletedFileList, cls: "sync-file-list-header" });
		const fileList = fileListContainer.createEl("ul", { cls: "sync-file-list-items" });

		for (const filePath of this.filePaths) {
			fileList.createEl("li", { text: filePath });
		}

		const buttonContainer = contentEl.createEl("div", { cls: "sync-conflict-buttons" });

		const deleteBtn = buttonContainer.createEl("button", {
			text: i18n.deleteLocally,
			cls: "mod-warning",
		});
		deleteBtn.addEventListener("click", () => {
			this.resolved = true;
			this.onChoice(true);
			this.close();
		});

		const keepBtn = buttonContainer.createEl("button", {
			text: i18n.keepLocally,
			cls: "mod-cta",
		});
		keepBtn.addEventListener("click", () => {
			this.resolved = true;
			this.onChoice(false);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// If closed without choice (ESC or click outside), default to keep locally
		if (!this.resolved) {
			this.onChoice(false);
		}
	}
}

/**
 * Modal for confirming push to server
 */
export class PushConfirmModal extends Modal {
	private filePaths: string[];
	private onChoice: (proceed: boolean, dontAskAgain: boolean) => void;
	private dontAskAgain: boolean = false;
	private resolved: boolean = false;

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

		// Show file list
		const fileListContainer = contentEl.createEl("div", { cls: "sync-file-list" });
		fileListContainer.createEl("p", { text: i18n.pushConfirmFileList, cls: "sync-file-list-header" });
		const fileList = fileListContainer.createEl("ul", { cls: "sync-file-list-items" });

		for (const filePath of this.filePaths) {
			fileList.createEl("li", { text: filePath });
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
			this.resolved = true;
			this.onChoice(true, this.dontAskAgain);
			this.close();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: i18n.pushConfirmCancel,
		});
		cancelBtn.addEventListener("click", () => {
			this.resolved = true;
			this.onChoice(false, false);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// If closed without choice (ESC or click outside), cancel the push
		if (!this.resolved) {
			this.onChoice(false, false);
		}
	}
}

/**
 * Modal for first-time sync migration
 */
export class MigrationModal extends Modal {
	private conflictCount: number;
	private onChoice: (trustServer: boolean) => void;
	private resolved: boolean = false;

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
			this.resolved = true;
			this.onChoice(false);
			this.close();
		});

		const trustBtn = buttonContainer.createEl("button", {
			text: i18n.trustServerForAll,
		});
		trustBtn.addEventListener("click", () => {
			this.resolved = true;
			this.onChoice(true);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// If closed without choice (ESC or click outside), review each conflict
		if (!this.resolved) {
			this.onChoice(false);
		}
	}
}

export type AssetConflictResolution = "keep_local" | "keep_remote" | "skip";

export interface AssetConflict {
	path: string;
	absolutePath: string;
	localHash: string;
	remoteHash: string;
	remoteUrl: string;
	noteId: string;
}

/**
 * Modal for handling asset conflicts (local vs remote)
 */
export class AssetConflictModal extends Modal {
	private conflicts: AssetConflict[];
	private onChoice: (resolution: AssetConflictResolution, applyToAll: boolean) => void;
	private resolved: boolean = false;
	private applyToAll: boolean = false;

	constructor(
		app: App,
		conflicts: AssetConflict[],
		onChoice: (resolution: AssetConflictResolution, applyToAll: boolean) => void
	) {
		super(app);
		this.conflicts = conflicts;
		this.onChoice = onChoice;
	}

	onOpen() {
		const { contentEl } = this;
		const i18n = t();

		contentEl.empty();
		contentEl.addClass("sync-asset-conflict-modal");

		contentEl.createEl("h2", { text: i18n.assetConflictTitle });
		contentEl.createEl("p", {
			text: i18n.assetConflictDescription(this.conflicts.length),
		});

		// Show file list
		const fileListContainer = contentEl.createEl("div", { cls: "sync-file-list" });
		fileListContainer.createEl("p", { text: i18n.assetConflictFileList, cls: "sync-file-list-header" });
		const fileList = fileListContainer.createEl("ul", { cls: "sync-file-list-items" });

		for (const conflict of this.conflicts) {
			fileList.createEl("li", { text: conflict.absolutePath });
		}

		// Apply to all checkbox (only show if multiple conflicts)
		if (this.conflicts.length > 1) {
			new Setting(contentEl)
				.setName(i18n.assetConflictApplyToAll)
				.addToggle((toggle) =>
					toggle.setValue(false).onChange((value) => {
						this.applyToAll = value;
					})
				);
		}

		const buttonContainer = contentEl.createEl("div", { cls: "sync-conflict-buttons" });

		const keepLocalBtn = buttonContainer.createEl("button", {
			text: i18n.assetConflictKeepLocal,
			cls: "mod-cta",
		});
		keepLocalBtn.addEventListener("click", () => {
			this.resolved = true;
			this.onChoice("keep_local", this.applyToAll);
			this.close();
		});

		const keepRemoteBtn = buttonContainer.createEl("button", {
			text: i18n.assetConflictKeepRemote,
		});
		keepRemoteBtn.addEventListener("click", () => {
			this.resolved = true;
			this.onChoice("keep_remote", this.applyToAll);
			this.close();
		});

		const skipBtn = buttonContainer.createEl("button", {
			text: i18n.assetConflictSkip,
			cls: "mod-muted",
		});
		skipBtn.addEventListener("click", () => {
			this.resolved = true;
			this.onChoice("skip", this.applyToAll);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// If closed without choice (ESC or click outside), skip
		if (!this.resolved) {
			this.onChoice("skip", false);
		}
	}
}
