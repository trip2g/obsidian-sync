import { ItemView, WorkspaceLeaf } from "obsidian";
import type { ConflictInfo, ConflictResolution } from "../types";
import { computeSideBySideDiff, type DiffLine } from "../diff";
import { t } from "../i18n";

export const CONFLICT_VIEW_TYPE = "sync-conflict-view";

interface ConflictQueueItem {
	conflict: ConflictInfo;
	resolve: (resolution: ConflictResolution) => void;
}

export class ConflictView extends ItemView {
	private queue: ConflictQueueItem[] = [];
	private currentIndex = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return CONFLICT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t().syncConflict;
	}

	getIcon(): string {
		return "alert-triangle";
	}

	async onOpen() {
		this.render();
	}

	async onClose() {
		// Skip remaining conflicts
		for (let i = this.currentIndex; i < this.queue.length; i++) {
			this.queue[i].resolve("skip");
		}
		this.queue = [];
		this.currentIndex = 0;
	}

	setConflicts(conflicts: ConflictQueueItem[]) {
		this.queue = conflicts;
		this.currentIndex = 0;
		this.render();
	}

	private render() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("sync-conflict-view");

		if (this.queue.length === 0) {
			container.createEl("div", {
				cls: "sync-conflict-empty",
				text: t().noConflicts,
			});
			return;
		}

		if (this.currentIndex >= this.queue.length) {
			container.createEl("div", {
				cls: "sync-conflict-empty",
				text: t().allConflictsResolved,
			});
			setTimeout(() => {
				this.leaf.detach();
			}, 1500);
			return;
		}

		const current = this.queue[this.currentIndex];
		this.renderConflict(container, current.conflict);
	}

	private renderConflict(container: Element, conflict: ConflictInfo) {
		const i18n = t();

		// Header with progress
		const header = container.createEl("div", { cls: "sync-conflict-header" });
		header.createEl("h2", { text: i18n.syncConflict });
		header.createEl("span", {
			cls: "sync-conflict-progress",
			text: i18n.conflictProgress(this.currentIndex + 1, this.queue.length),
		});

		// File path
		container.createEl("div", {
			cls: "sync-conflict-path",
			text: conflict.path,
		});

		// Compute diff
		const diff = computeSideBySideDiff(conflict.localContent, conflict.remoteContent);

		// Stats
		const localLines = conflict.localContent.split("\n").length;
		const remoteLines = conflict.remoteContent.split("\n").length;

		const stats = container.createEl("div", { cls: "sync-conflict-stats" });
		stats.createSpan({ text: i18n.localLines(localLines), cls: "sync-stat" });
		stats.createSpan({ text: " | " });
		stats.createSpan({ text: i18n.serverLines(remoteLines), cls: "sync-stat" });
		stats.createSpan({ text: " | " });
		stats.createSpan({
			text: i18n.linesChanged(diff.stats.added, diff.stats.removed, diff.stats.modified),
			cls: "sync-stat-changes",
		});

		// Action buttons
		this.renderButtons(container);

		// Content area - side by side with diff
		const contentArea = container.createEl("div", { cls: "sync-conflict-content" });

		// Local column
		const localCol = contentArea.createEl("div", { cls: "sync-conflict-column" });
		localCol.createEl("h3", { text: i18n.localVersion });
		this.renderDiffColumn(localCol, diff.left, "local");

		// Remote column
		const remoteCol = contentArea.createEl("div", { cls: "sync-conflict-column" });
		remoteCol.createEl("h3", { text: i18n.serverVersion });
		this.renderDiffColumn(remoteCol, diff.right, "remote");
	}

	private renderDiffColumn(container: Element, lines: DiffLine[], side: "local" | "remote") {
		const codeContainer = container.createEl("div", { cls: "sync-conflict-code" });

		for (const line of lines) {
			const lineEl = codeContainer.createEl("div", {
				cls: `sync-diff-line sync-diff-${line.type}`,
			});

			// Line number
			const lineNum = lineEl.createEl("span", { cls: "sync-line-number" });
			lineNum.setText(line.lineNumber !== null ? String(line.lineNumber) : "");

			// Content
			const contentEl = lineEl.createEl("span", { cls: "sync-line-content" });
			contentEl.setText(line.content);
		}
	}

	private renderButtons(container: Element) {
		const i18n = t();
		const buttonContainer = container.createEl("div", { cls: "sync-conflict-actions" });

		const localBtn = buttonContainer.createEl("button", {
			text: i18n.keepLocal,
			cls: "mod-warning",
		});
		localBtn.addEventListener("click", () => this.resolve("keep_local"));

		const remoteBtn = buttonContainer.createEl("button", {
			text: i18n.useServer,
			cls: "mod-cta",
		});
		remoteBtn.addEventListener("click", () => this.resolve("keep_remote"));

		const bothBtn = buttonContainer.createEl("button", {
			text: i18n.keepBoth,
		});
		bothBtn.addEventListener("click", () => this.resolve("keep_both"));

		const skipBtn = buttonContainer.createEl("button", {
			text: i18n.skip,
		});
		skipBtn.addEventListener("click", () => this.resolve("skip"));

		// Skip all button if there are multiple conflicts
		if (this.queue.length > 1 && this.currentIndex < this.queue.length - 1) {
			const remaining = this.queue.length - this.currentIndex;
			const skipAllBtn = buttonContainer.createEl("button", {
				text: i18n.skipAll(remaining),
				cls: "mod-muted",
			});
			skipAllBtn.addEventListener("click", () => {
				for (let i = this.currentIndex; i < this.queue.length; i++) {
					this.queue[i].resolve("skip");
				}
				this.currentIndex = this.queue.length;
				this.render();
			});
		}
	}

	private resolve(resolution: ConflictResolution) {
		if (this.currentIndex < this.queue.length) {
			this.queue[this.currentIndex].resolve(resolution);
			this.currentIndex++;
			this.render();
		}
	}
}
