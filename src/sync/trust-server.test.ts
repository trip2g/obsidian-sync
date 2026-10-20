import { describe, it, expect } from "vitest";
import { trustServerBase } from "./trust-server";
import { classifyFile } from "./classify";
import type { FileClassification } from "./types";

function c(path: string, localHash: string | null, remoteHash: string | null): FileClassification {
	return { path, action: "conflict", localHash, remoteHash, lastSyncedHash: null };
}

describe("trustServerBase", () => {
	const classifications = [c("both.md", "L", "R"), c("server-only.md", null, "R2"), c("local-only.md", "L3", null)];

	it("records the server hash for every server file in two-way mode", () => {
		expect(trustServerBase(classifications, true)).toEqual({ "both.md": "R", "server-only.md": "R2" });
	});

	it("skips server-only files in one-way mode, since nothing is pulled", () => {
		expect(trustServerBase(classifications, false)).toEqual({ "both.md": "R" });
	});

	it("never makes a server-only file look locally deleted on the next one-way sync", () => {
		const base = trustServerBase(classifications, false);
		expect(classifyFile(null, "R2", base["server-only.md"] ?? null)).not.toBe("local_deleted");
	});
});
