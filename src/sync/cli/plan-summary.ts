import type { SyncPlan } from "../types";
import type { CliConflictResolution } from "./env";

/**
 * Render the sync plan as the lines the CLI prints.
 *
 * Every non-empty bucket states what the run will do to it. Counts alone are
 * ambiguous: `Remote only` is downloaded, not skipped, and `Local deleted`
 * hides notes on the server without any flag being passed. A reader who sees
 * `To pull: 0` next to `Remote only: 25` concludes nothing will be written
 * locally, which is the opposite of what happens.
 *
 * The labels need no mode: filterPlan empties `remoteOnly` and `serverDeleted`
 * unless twoWaySync is on, so a non-zero count already implies that mode.
 */

const CONFLICT_EFFECT: Record<CliConflictResolution, string> = {
	local: "local version wins, pushed to the server",
	remote: "server version wins, overwrites the local file",
	skip: "left untouched on both sides",
	fail: "sync stops at the first one",
};

export function formatPlanSummary(plan: SyncPlan, conflictResolution: CliConflictResolution): string[] {
	const rows: [string, number, string][] = [
		["Unchanged", plan.unchanged, ""],
		["To push", plan.pushes.length, "uploaded to the server"],
		["Local only", plan.localOnly.length, "uploaded as new server notes"],
		["To pull", plan.pulls.length, "downloaded over the local file"],
		["Remote only", plan.remoteOnly.length, "downloaded as new local files"],
		["Conflicts", plan.conflicts.length, CONFLICT_EFFECT[conflictResolution]],
		["Local deleted", plan.localDeleted.length, "hidden on the server"],
		["Server deleted", plan.serverDeleted.length, "kept locally, state updated"],
	];

	return rows.map(([label, count, effect]) => {
		const head = `  ${`${label}:`.padEnd(16)}${count}`;
		return count > 0 && effect ? `${head}  — ${effect}` : head;
	});
}
