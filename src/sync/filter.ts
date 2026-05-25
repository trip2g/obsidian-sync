import type { SyncPlan, FileClassification, FilterOptions } from "./types";

/**
 * Filter a sync plan based on business rules (twoWaySync, publishFields).
 *
 * When twoWaySync is false:
 * - pulls, remoteOnly, serverDeleted are ignored
 * - conflicts become pushes
 *
 * When hasPublishFields is provided:
 * - Files without publish fields are filtered out from push/local_only/local_deleted
 * - Files without publish fields are protected from pull/conflict (ignored)
 *
 * @param plan - The original sync plan from classifySync
 * @param options - Filter options
 * @returns Filtered sync plan
 */
export function filterPlan(plan: SyncPlan, options: FilterOptions): SyncPlan {
	const { twoWaySync, hasPublishFields, isExcluded } = options;

	// Helper to check if file should be included based on publishFields
	const isPublishable = (path: string): boolean => {
		if (!hasPublishFields) return true; // No filter = all files publishable
		return hasPublishFields(path);
	};

	// Helper to check if a path is excluded from sync
	const excluded = (path: string): boolean => {
		if (!isExcluded) return false; // No filter = nothing excluded
		return isExcluded(path);
	};

	const filteredClassifications: FileClassification[] = [];
	const pulls: FileClassification[] = [];
	const pushes: FileClassification[] = [];
	const conflicts: FileClassification[] = [];
	const localOnly: FileClassification[] = [];
	const remoteOnly: FileClassification[] = [];
	const localDeleted: FileClassification[] = [];
	const serverDeleted: FileClassification[] = [];
	let unchanged = 0;

	for (const c of plan.classifications) {
		// Excluded paths are never pushed. If they exist on the server, hide them
		// (treat as local_deleted); otherwise drop them entirely.
		if (excluded(c.path)) {
			if (c.remoteHash !== null) {
				const asHide: FileClassification =
					c.action === "local_deleted" ? c : { ...c, action: "local_deleted" };
				filteredClassifications.push(asHide);
				localDeleted.push(asHide);
			}
			continue;
		}

		const publishable = isPublishable(c.path);

		switch (c.action) {
			case "unchanged":
				filteredClassifications.push(c);
				unchanged++;
				break;

			case "pull":
				if (twoWaySync && publishable) {
					filteredClassifications.push(c);
					pulls.push(c);
				}
				// If not twoWaySync or not publishable -> ignored (protected)
				break;

			case "push":
				if (publishable) {
					filteredClassifications.push(c);
					pushes.push(c);
				}
				// If not publishable -> ignored
				break;

			case "conflict":
				if (!twoWaySync) {
					// Conflict becomes push when twoWaySync is off
					if (publishable) {
						const asPush: FileClassification = { ...c, action: "push" };
						filteredClassifications.push(asPush);
						pushes.push(asPush);
					}
				} else if (publishable) {
					filteredClassifications.push(c);
					conflicts.push(c);
				}
				// If not publishable -> ignored (protected)
				break;

			case "local_only":
				if (publishable) {
					filteredClassifications.push(c);
					localOnly.push(c);
				}
				// If not publishable -> ignored
				break;

			case "remote_only":
				if (twoWaySync) {
					// remote_only doesn't depend on publishable (new file from server)
					filteredClassifications.push(c);
					remoteOnly.push(c);
				}
				// If not twoWaySync -> ignored
				break;

			case "local_deleted":
				if (publishable) {
					filteredClassifications.push(c);
					localDeleted.push(c);
				}
				// If not publishable -> ignored (was never synced anyway)
				break;

			case "server_deleted":
				if (twoWaySync) {
					filteredClassifications.push(c);
					serverDeleted.push(c);
				}
				// If not twoWaySync -> ignored
				break;
		}
	}

	return {
		classifications: filteredClassifications,
		pulls,
		pushes,
		conflicts,
		localOnly,
		remoteOnly,
		localDeleted,
		serverDeleted,
		unchanged,
	};
}
