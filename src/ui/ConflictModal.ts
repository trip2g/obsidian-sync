import { App, Modal } from "obsidian";
import { t } from "../i18n";

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
