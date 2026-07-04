/**
 * Auto-sync status state machine for the "Auto-sync on save" status-bar item.
 *
 * Pure logic, Obsidian-free: main.ts drives the transitions from the auto-push
 * lifecycle (edit -> debounce -> push -> done/error) and renders the resulting
 * label. Kept testable in isolation because the status-bar DOM has no runtime
 * outside Obsidian.
 *
 * States: off (autosync disabled) · idle (nothing pending, last sync ok) ·
 * pending (edits queued, debounce counting) · syncing (push in flight) ·
 * error (last push failed).
 */

export type SyncStatus = "off" | "idle" | "pending" | "syncing" | "error";

export interface SyncStatusModel {
	status: SyncStatus;
	/** Count of distinct paths queued for the next push (pending state). */
	pending: number;
	/** Epoch ms of the last successful push, or null if none yet. */
	lastSyncedAt: number | null;
}

export function initialSyncStatus(enabled: boolean): SyncStatusModel {
	return { status: enabled ? "idle" : "off", pending: 0, lastSyncedAt: null };
}

/** Auto-sync toggle changed: off clears everything; on resets to idle. */
export function onEnabledChange(model: SyncStatusModel, enabled: boolean): SyncStatusModel {
	if (!enabled) return { status: "off", pending: 0, lastSyncedAt: model.lastSyncedAt };
	if (model.status === "off") return { ...model, status: "idle" };
	return model;
}

/** An edit was queued for the debounced push. No-op when disabled. */
export function onEditScheduled(model: SyncStatusModel, pending: number): SyncStatusModel {
	if (model.status === "off") return model;
	return { ...model, status: "pending", pending };
}

/** A push started (debounce fired, flush running). */
export function onSyncStart(model: SyncStatusModel): SyncStatusModel {
	if (model.status === "off") return model;
	return { ...model, status: "syncing", pending: 0 };
}

/** A push finished successfully. */
export function onSyncSuccess(model: SyncStatusModel, at: number): SyncStatusModel {
	if (model.status === "off") return model;
	return { ...model, status: "idle", pending: 0, lastSyncedAt: at };
}

/** A push failed. */
export function onSyncError(model: SyncStatusModel): SyncStatusModel {
	if (model.status === "off") return model;
	return { ...model, status: "error", pending: 0 };
}
