import { describe, it, expect } from "vitest";
import { formatPlanSummary } from "./plan-summary";
import type { SyncPlan, FileClassification } from "../types";

function file(path: string): FileClassification {
	return {
		path,
		action: "remote_only",
		localHash: null,
		remoteHash: "remote_hash",
		lastSyncedHash: null,
	};
}

function plan(over: Partial<SyncPlan> = {}): SyncPlan {
	return {
		classifications: [],
		pulls: [],
		pushes: [],
		conflicts: [],
		localOnly: [],
		remoteOnly: [],
		localDeleted: [],
		serverDeleted: [],
		unchanged: 0,
		...over,
	};
}

const line = (out: string[], label: string) => out.find((l) => l.trimStart().startsWith(`${label}:`))!;

describe("formatPlanSummary", () => {
	it("says remote-only notes are downloaded, not skipped", () => {
		const out = formatPlanSummary(plan({ remoteOnly: [file("a.md")] }), "local");
		expect(line(out, "Remote only")).toContain("1");
		expect(line(out, "Remote only")).toContain("downloaded as new local files");
	});

	it("warns that a locally deleted note is hidden on the server", () => {
		const out = formatPlanSummary(plan({ localDeleted: [file("a.md")] }), "skip");
		expect(line(out, "Local deleted")).toContain("hidden on the server");
	});

	it("spells out what the chosen conflict resolution will do", () => {
		const conflicts = [file("a.md")];
		expect(line(formatPlanSummary(plan({ conflicts }), "local"), "Conflicts")).toContain("local version wins");
		expect(line(formatPlanSummary(plan({ conflicts }), "remote"), "Conflicts")).toContain("overwrites the local file");
		expect(line(formatPlanSummary(plan({ conflicts }), "skip"), "Conflicts")).toContain("left untouched");
		expect(line(formatPlanSummary(plan({ conflicts }), "fail"), "Conflicts")).toContain("stops at the first one");
	});

	it("leaves empty buckets as a bare count, so a quiet plan stays quiet", () => {
		const out = formatPlanSummary(plan(), "local");
		expect(out.every((l) => !l.includes("—"))).toBe(true);
		expect(line(out, "Remote only")).toBe(`  ${"Remote only:".padEnd(16)}0`);
	});

	it("keeps one line per bucket, in a stable order", () => {
		const out = formatPlanSummary(plan(), "local");
		expect(out.map((l) => l.trim().split(":")[0])).toEqual([
			"Unchanged",
			"To push",
			"Local only",
			"To pull",
			"Remote only",
			"Conflicts",
			"Local deleted",
			"Server deleted",
		]);
	});
});
