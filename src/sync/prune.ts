import type { SyncPlan } from "./types";

export interface PruneSummary {
	/** Server notes absent from the local tree that --prune will hide. */
	paths: string[];
	/** Count of paths present locally in the unfiltered plan. */
	localPresent: number;
	/** Count of paths present on the server in the unfiltered plan. */
	serverPresent: number;
}

/**
 * Summarize what a --prune run would hide.
 *
 * @param plan - unfiltered plan from classifySync (for local/server counts)
 * @param prunedPlan - plan after filterPlan({ prune: true }); its localDeleted
 *   holds every server note absent locally within the synced prefix.
 */
export function summarizePrune(plan: SyncPlan, prunedPlan: SyncPlan): PruneSummary {
	return {
		paths: prunedPlan.localDeleted.map((c) => c.path),
		localPresent: plan.classifications.filter((c) => c.localHash !== null).length,
		serverPresent: plan.classifications.filter((c) => c.remoteHash !== null).length,
	};
}

/**
 * Guard against wiping the server from an empty/partial local copy. Returns true
 * when --prune would hide server notes but the local tree has none — a likely
 * reset or partial checkout that must be confirmed with --force.
 */
export function pruneNeedsForce(summary: PruneSummary): boolean {
	return summary.localPresent === 0 && summary.paths.length > 0;
}
