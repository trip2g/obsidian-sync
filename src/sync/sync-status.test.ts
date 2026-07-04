import { describe, it, expect } from "vitest";
import {
	initialSyncStatus,
	onEnabledChange,
	onEditScheduled,
	onSyncStart,
	onSyncSuccess,
	onSyncError,
} from "./sync-status";

describe("sync-status state machine", () => {
	it("initial status reflects the autosync toggle", () => {
		expect(initialSyncStatus(true).status).toBe("idle");
		expect(initialSyncStatus(false).status).toBe("off");
	});

	it("full happy path: idle -> pending -> syncing -> idle with lastSyncedAt", () => {
		let m = initialSyncStatus(true);
		m = onEditScheduled(m, 1);
		expect(m).toMatchObject({ status: "pending", pending: 1 });

		m = onSyncStart(m);
		expect(m).toMatchObject({ status: "syncing", pending: 0 });

		m = onSyncSuccess(m, 1234);
		expect(m).toMatchObject({ status: "idle", pending: 0, lastSyncedAt: 1234 });
	});

	it("pending count reflects the queued paths", () => {
		let m = initialSyncStatus(true);
		m = onEditScheduled(m, 3);
		expect(m.pending).toBe(3);
	});

	it("a failed push moves to error", () => {
		let m = onSyncStart(onEditScheduled(initialSyncStatus(true), 1));
		m = onSyncError(m);
		expect(m.status).toBe("error");
		expect(m.pending).toBe(0);
	});

	it("editing after an error recovers to pending", () => {
		let m = onSyncError(onSyncStart(initialSyncStatus(true)));
		m = onEditScheduled(m, 1);
		expect(m.status).toBe("pending");
	});

	it("disabling autosync forces off and clears pending but keeps lastSyncedAt", () => {
		let m = onSyncSuccess(onSyncStart(initialSyncStatus(true)), 42);
		m = onEditScheduled(m, 2);
		m = onEnabledChange(m, false);
		expect(m).toMatchObject({ status: "off", pending: 0, lastSyncedAt: 42 });
	});

	it("re-enabling autosync from off returns to idle", () => {
		const m = onEnabledChange(initialSyncStatus(false), true);
		expect(m.status).toBe("idle");
	});

	it("all transitions are no-ops while off (except re-enable)", () => {
		const off = initialSyncStatus(false);
		expect(onEditScheduled(off, 1).status).toBe("off");
		expect(onSyncStart(off).status).toBe("off");
		expect(onSyncSuccess(off, 1).status).toBe("off");
		expect(onSyncError(off).status).toBe("off");
	});
});
