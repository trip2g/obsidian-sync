import { describe, it, expect } from "vitest";
import { filterPlan } from "./filter";
import type { SyncPlan, FileClassification } from "./types";

// Helper to create a classification
function makeClassification(
	path: string,
	action: FileClassification["action"]
): FileClassification {
	return {
		path,
		action,
		localHash: action === "remote_only" ? null : "local_hash",
		remoteHash: action === "local_only" ? null : "remote_hash",
		lastSyncedHash: null,
	};
}

// Helper to create a plan with specific classifications
function makePlan(classifications: FileClassification[]): SyncPlan {
	const plan: SyncPlan = {
		classifications,
		pulls: [],
		pushes: [],
		conflicts: [],
		localOnly: [],
		remoteOnly: [],
		localDeleted: [],
		serverDeleted: [],
		unchanged: 0,
	};

	for (const c of classifications) {
		switch (c.action) {
			case "unchanged":
				plan.unchanged++;
				break;
			case "pull":
				plan.pulls.push(c);
				break;
			case "push":
				plan.pushes.push(c);
				break;
			case "conflict":
				plan.conflicts.push(c);
				break;
			case "local_only":
				plan.localOnly.push(c);
				break;
			case "remote_only":
				plan.remoteOnly.push(c);
				break;
			case "local_deleted":
				plan.localDeleted.push(c);
				break;
			case "server_deleted":
				plan.serverDeleted.push(c);
				break;
		}
	}

	return plan;
}

describe("filterPlan", () => {
	describe("twoWaySync: true (full sync)", () => {
		it("keeps all actions when twoWaySync is true", () => {
			const plan = makePlan([
				makeClassification("pull.md", "pull"),
				makeClassification("push.md", "push"),
				makeClassification("conflict.md", "conflict"),
				makeClassification("local.md", "local_only"),
				makeClassification("remote.md", "remote_only"),
				makeClassification("local_del.md", "local_deleted"),
				makeClassification("server_del.md", "server_deleted"),
				makeClassification("unchanged.md", "unchanged"),
			]);

			const filtered = filterPlan(plan, { twoWaySync: true });

			expect(filtered.pulls).toHaveLength(1);
			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.conflicts).toHaveLength(1);
			expect(filtered.localOnly).toHaveLength(1);
			expect(filtered.remoteOnly).toHaveLength(1);
			expect(filtered.localDeleted).toHaveLength(1);
			expect(filtered.serverDeleted).toHaveLength(1);
			expect(filtered.unchanged).toBe(1);
		});
	});

	describe("twoWaySync: false (push only)", () => {
		it("ignores pulls when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "pull")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.pulls).toHaveLength(0);
			expect(filtered.classifications).toHaveLength(0);
		});

		it("ignores remote_only when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "remote_only")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.remoteOnly).toHaveLength(0);
		});

		it("ignores server_deleted when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "server_deleted")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.serverDeleted).toHaveLength(0);
		});

		it("converts conflict to push when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "conflict")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.conflicts).toHaveLength(0);
			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.pushes[0].path).toBe("note.md");
			expect(filtered.pushes[0].action).toBe("push");
		});

		it("keeps push when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "push")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.pushes).toHaveLength(1);
		});

		it("keeps local_only when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "local_only")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.localOnly).toHaveLength(1);
		});

		it("keeps local_deleted when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "local_deleted")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.localDeleted).toHaveLength(1);
		});

		it("keeps unchanged when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("note.md", "unchanged")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.unchanged).toBe(1);
		});
	});

	describe("publishFields filtering", () => {
		const hasPublishFields = (path: string) => path.startsWith("public/");

		it("filters out push when file is not publishable", () => {
			const plan = makePlan([
				makeClassification("public/note.md", "push"),
				makeClassification("private/note.md", "push"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.pushes[0].path).toBe("public/note.md");
		});

		it("filters out local_only when file is not publishable", () => {
			const plan = makePlan([
				makeClassification("public/new.md", "local_only"),
				makeClassification("private/new.md", "local_only"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.localOnly).toHaveLength(1);
			expect(filtered.localOnly[0].path).toBe("public/new.md");
		});

		it("protects non-publishable files from pull (ignores)", () => {
			const plan = makePlan([
				makeClassification("public/note.md", "pull"),
				makeClassification("private/note.md", "pull"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.pulls).toHaveLength(1);
			expect(filtered.pulls[0].path).toBe("public/note.md");
		});

		it("protects non-publishable files from conflict (ignores)", () => {
			const plan = makePlan([
				makeClassification("public/note.md", "conflict"),
				makeClassification("private/note.md", "conflict"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.conflicts).toHaveLength(1);
			expect(filtered.conflicts[0].path).toBe("public/note.md");
		});

		it("filters out local_deleted when file is not publishable", () => {
			const plan = makePlan([
				makeClassification("public/del.md", "local_deleted"),
				makeClassification("private/del.md", "local_deleted"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.localDeleted).toHaveLength(1);
			expect(filtered.localDeleted[0].path).toBe("public/del.md");
		});

		it("does not filter remote_only by publishFields (new file from server)", () => {
			const plan = makePlan([
				makeClassification("public/new.md", "remote_only"),
				makeClassification("private/new.md", "remote_only"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			// Both should be included - remote_only doesn't check publishFields
			expect(filtered.remoteOnly).toHaveLength(2);
		});

		it("keeps unchanged regardless of publishFields", () => {
			const plan = makePlan([
				makeClassification("public/note.md", "unchanged"),
				makeClassification("private/note.md", "unchanged"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.unchanged).toBe(2);
		});
	});

	describe("combined: twoWaySync false + publishFields", () => {
		const hasPublishFields = (path: string) => path.startsWith("public/");

		it("converts conflict to push only for publishable files", () => {
			const plan = makePlan([
				makeClassification("public/conflict.md", "conflict"),
				makeClassification("private/conflict.md", "conflict"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: false, hasPublishFields });

			expect(filtered.conflicts).toHaveLength(0);
			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.pushes[0].path).toBe("public/conflict.md");
		});

		it("ignores pull even for publishable files when twoWaySync is false", () => {
			const plan = makePlan([makeClassification("public/note.md", "pull")]);
			const filtered = filterPlan(plan, { twoWaySync: false, hasPublishFields });

			expect(filtered.pulls).toHaveLength(0);
		});
	});

	describe("exclude patterns", () => {
		const isExcluded = (path: string) => path === "dev" || path.startsWith("dev/") || path === "demo" || path.startsWith("demo/");

		it("hides an excluded file that exists on the server (push -> local_deleted)", () => {
			const plan = makePlan([
				makeClassification("dev/note.md", "push"),
				makeClassification("keep.md", "push"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: false, isExcluded });

			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.pushes[0].path).toBe("keep.md");
			expect(filtered.localDeleted).toHaveLength(1);
			expect(filtered.localDeleted[0].path).toBe("dev/note.md");
			expect(filtered.localDeleted[0].action).toBe("local_deleted");
		});

		it("hides an excluded unchanged file (present on server)", () => {
			const plan = makePlan([makeClassification("demo/x.md", "unchanged")]);
			const filtered = filterPlan(plan, { twoWaySync: false, isExcluded });

			expect(filtered.unchanged).toBe(0);
			expect(filtered.localDeleted).toHaveLength(1);
			expect(filtered.localDeleted[0].path).toBe("demo/x.md");
		});

		it("hides an excluded remote_only file", () => {
			const plan = makePlan([makeClassification("demo/x.md", "remote_only")]);
			const filtered = filterPlan(plan, { twoWaySync: true, isExcluded });

			expect(filtered.remoteOnly).toHaveLength(0);
			expect(filtered.localDeleted).toHaveLength(1);
			expect(filtered.localDeleted[0].path).toBe("demo/x.md");
		});

		it("drops an excluded local-only file (never pushed, nothing to hide)", () => {
			const plan = makePlan([makeClassification("dev/new.md", "local_only")]);
			const filtered = filterPlan(plan, { twoWaySync: false, isExcluded });

			expect(filtered.localOnly).toHaveLength(0);
			expect(filtered.localDeleted).toHaveLength(0);
			expect(filtered.classifications).toHaveLength(0);
		});

		it("leaves non-excluded files untouched", () => {
			const plan = makePlan([
				makeClassification("keep.md", "push"),
				makeClassification("docs/keep.md", "unchanged"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: false, isExcluded });

			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.unchanged).toBe(1);
			expect(filtered.localDeleted).toHaveLength(0);
		});

		it("does nothing when isExcluded is not provided", () => {
			const plan = makePlan([makeClassification("dev/note.md", "push")]);
			const filtered = filterPlan(plan, { twoWaySync: false });

			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.localDeleted).toHaveLength(0);
		});
	});

	describe("edge cases", () => {
		it("handles empty plan", () => {
			const plan = makePlan([]);
			const filtered = filterPlan(plan, { twoWaySync: true });

			expect(filtered.classifications).toHaveLength(0);
			expect(filtered.unchanged).toBe(0);
		});

		it("works without hasPublishFields callback (all files publishable)", () => {
			const plan = makePlan([
				makeClassification("any/file.md", "push"),
				makeClassification("another/file.md", "local_only"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true });

			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.localOnly).toHaveLength(1);
		});
	});

	describe("HTML files without frontmatter", () => {
		// Simulate hasPublishFields that returns false for HTML files
		// because they don't have frontmatter
		const hasPublishFields = (path: string) => {
			// HTML files like _layouts/*.html don't have frontmatter
			if (path.endsWith(".html")) return false;
			// MD files with publish field
			return path.startsWith("public/");
		};

		it("filters out HTML files from push when hasPublishFields returns false", () => {
			const plan = makePlan([
				makeClassification("public/note.md", "push"),
				makeClassification("_layouts/base.html", "push"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.pushes).toHaveLength(1);
			expect(filtered.pushes[0].path).toBe("public/note.md");
		});

		it("filters out HTML files from local_only when hasPublishFields returns false", () => {
			const plan = makePlan([
				makeClassification("public/new.md", "local_only"),
				makeClassification("_layouts/new.html", "local_only"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			expect(filtered.localOnly).toHaveLength(1);
			expect(filtered.localOnly[0].path).toBe("public/new.md");
		});

		it("allows HTML files to be unchanged even without publish fields", () => {
			const plan = makePlan([
				makeClassification("public/note.md", "unchanged"),
				makeClassification("_layouts/base.html", "unchanged"),
			]);
			const filtered = filterPlan(plan, { twoWaySync: true, hasPublishFields });

			// unchanged files are not filtered by publishFields
			expect(filtered.unchanged).toBe(2);
		});
	});
});
