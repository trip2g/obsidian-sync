import { describe, it, expect, vi, afterEach } from "vitest";
import { printSyncResult, EXIT_FAILURE } from "./sync-report";
import type { SyncResult } from "../types";

function result(over: Partial<SyncResult> = {}): SyncResult {
	return {
		pulled: 0,
		pushed: 0,
		conflictsResolved: 0,
		assetsUploaded: 0,
		assetsDownloaded: 0,
		errors: [],
		updatedUrls: [],
		warnings: [],
		...over,
	};
}

function capture(): () => string {
	const lines: string[] = [];
	const record = (...a: unknown[]) => {
		lines.push(a.join(" "));
	};
	vi.spyOn(console, "log").mockImplementation(record);
	vi.spyOn(console, "error").mockImplementation(record);
	return () => lines.join("\n");
}

describe("printSyncResult", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fails the run when an operation failed, after printing what did succeed", () => {
		const output = capture();

		const code = printSyncResult(result({ pushed: 2, errors: ["Failed to push a.md: timeout"] }), 3, "");

		expect(code).toBe(EXIT_FAILURE);
		expect(code).not.toBe(0);
		expect(output()).toContain("Pushed:             2");
		expect(output()).toContain("Failed to push a.md: timeout");
	});

	it("never says everything is up to date when an operation failed", () => {
		const output = capture();

		const code = printSyncResult(result({ errors: ["Failed to download asset img.png"] }), 0, "");

		expect(code).toBe(EXIT_FAILURE);
		expect(output()).not.toContain("up to date");
		expect(output()).toContain("Failed to download asset img.png");
	});

	it("succeeds when nothing failed", () => {
		const output = capture();

		expect(printSyncResult(result(), 0, "")).toBe(0);
		expect(output()).toContain("Everything is up to date!");
		expect(printSyncResult(result({ pushed: 1 }), 1, "")).toBe(0);
	});

	it("fails the run on a critical warning", () => {
		capture();

		const warnings = [{ path: "_layouts/x.html", level: "CRITICAL", message: "parse error" }];

		expect(printSyncResult(result({ pushed: 1, warnings }), 1, "")).toBe(EXIT_FAILURE);
	});
});
