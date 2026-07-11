import { describe, it, expect } from "vitest";
import { classifySync } from "./classify";
import { filterPlan } from "./filter";
import { summarizePrune, pruneNeedsForce } from "./prune";
import type { ClassifyEnv, SyncState, LocalFile, ServerHash } from "./types";

/**
 * Minimal ClassifyEnv reproducing the orphaned-server-note condition: the local
 * sync-state does NOT list notes that exist on the server. Content hashes are
 * derived from the (remote) path so a note present both locally and on the
 * server is "unchanged". getServerHashes mirrors NodeEnv's prefix scoping.
 */
function makeClassifyEnv(opts: {
	local: string[];
	server: string[];
	state?: SyncState;
	prefix?: string;
}): ClassifyEnv {
	const { local, server, state = { files: {} }, prefix = "" } = opts;
	const matchesPrefix = (p: string) => (prefix ? p.startsWith(prefix + "/") : true);
	return {
		getLocalFiles: async (): Promise<LocalFile[]> => local.map((path) => ({ path, mtime: 1 })),
		getServerHashes: async (): Promise<ServerHash[]> =>
			server.filter(matchesPrefix).map((path) => ({ path, hash: `h:${path}` })),
		getSyncState: () => state,
		computeHash: async (content: string) => content,
		readFileContent: async (path: string) => `h:${path}`,
	};
}

describe("prune orphaned-server-note repro", () => {
	it("classifies untracked server notes as remote_only and prunes exactly them within prefix", async () => {
		const env = makeClassifyEnv({
			prefix: "docs",
			local: ["docs/keep.md"],
			// Two orphans under prefix + one note outside the prefix.
			server: ["docs/keep.md", "docs/hub/a.md", "docs/hub/b.md", "blog/other.md"],
			state: { files: {} }, // sync-state tracks nothing — the reset/replaced-state case
		});

		const plan = await classifySync(env);

		// The orphans have no sync-state record, so they classify as remote_only.
		expect(plan.remoteOnly.map((c) => c.path).sort()).toEqual(["docs/hub/a.md", "docs/hub/b.md"]);
		// The out-of-prefix note never entered the plan (getServerHashes prefix scoping).
		expect(plan.classifications.find((c) => c.path === "blog/other.md")).toBeUndefined();

		// (a) Regression: normal push-only sync hides nothing — the live bug.
		const normal = filterPlan(plan, { twoWaySync: false });
		expect(normal.localDeleted).toHaveLength(0);

		// (b)+(d) Prune hides exactly the two in-prefix orphans, keeps the local note.
		const pruned = filterPlan(plan, { twoWaySync: false, prune: true });
		expect(pruned.localDeleted.map((c) => c.path).sort()).toEqual([
			"docs/hub/a.md",
			"docs/hub/b.md",
		]);
		expect(pruned.unchanged).toBe(1);

		const summary = summarizePrune(plan, pruned);
		expect(summary.paths.sort()).toEqual(["docs/hub/a.md", "docs/hub/b.md"]);
		expect(summary.localPresent).toBe(1);
		expect(summary.serverPresent).toBe(3);
		expect(pruneNeedsForce(summary)).toBe(false);
	});
});

describe("pruneNeedsForce (empty-local-tree guard)", () => {
	it("refuses when the local tree is empty but the server has notes", () => {
		const summary = { paths: ["docs/a.md", "docs/b.md"], localPresent: 0, serverPresent: 2 };
		expect(pruneNeedsForce(summary)).toBe(true);
	});

	it("allows when at least one local note is present", () => {
		const summary = { paths: ["docs/a.md"], localPresent: 5, serverPresent: 6 };
		expect(pruneNeedsForce(summary)).toBe(false);
	});

	it("allows when there is nothing to prune", () => {
		const summary = { paths: [], localPresent: 0, serverPresent: 0 };
		expect(pruneNeedsForce(summary)).toBe(false);
	});
});
