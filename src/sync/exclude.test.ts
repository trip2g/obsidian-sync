import { describe, it, expect } from "vitest";
import { makeExcludeMatcher } from "./exclude";

describe("makeExcludeMatcher", () => {
	it("returns always-false when no patterns given", () => {
		const m = makeExcludeMatcher([]);
		expect(m("dev/a.md")).toBe(false);
		expect(m("anything")).toBe(false);
	});

	it("ignores empty / whitespace-only patterns", () => {
		const m = makeExcludeMatcher(["", "  "]);
		expect(m("dev/a.md")).toBe(false);
	});

	describe("directory / prefix patterns", () => {
		const m = makeExcludeMatcher(["dev", "demo"]);

		it("matches the directory itself", () => {
			expect(m("dev")).toBe(true);
			expect(m("demo")).toBe(true);
		});

		it("matches files under the directory", () => {
			expect(m("dev/a.md")).toBe(true);
			expect(m("demo/sub/deep/x.md")).toBe(true);
		});

		it("does not match sibling prefixes", () => {
			expect(m("developer.md")).toBe(false);
			expect(m("developer/x.md")).toBe(false);
			expect(m("demonstration.md")).toBe(false);
		});

		it("anchors at the path root (no nested match)", () => {
			expect(m("a/dev/x.md")).toBe(false);
			expect(m("a/demo.md")).toBe(false);
		});
	});

	it("treats a trailing slash the same as a bare directory", () => {
		const m = makeExcludeMatcher(["dev/"]);
		expect(m("dev")).toBe(true);
		expect(m("dev/a.md")).toBe(true);
	});

	describe("glob patterns", () => {
		it("supports * within a single path segment", () => {
			const m = makeExcludeMatcher(["*.tmp"]);
			expect(m("foo.tmp")).toBe(true);
			expect(m("a/foo.tmp")).toBe(false);
		});

		it("supports ** across segments", () => {
			const m = makeExcludeMatcher(["**/*.tmp"]);
			expect(m("foo.tmp")).toBe(false);
			expect(m("a/foo.tmp")).toBe(true);
			expect(m("a/b/foo.tmp")).toBe(true);
		});
	});

	it("matches if any pattern matches", () => {
		const m = makeExcludeMatcher(["dev", "*.tmp"]);
		expect(m("dev/a.md")).toBe(true);
		expect(m("x.tmp")).toBe(true);
		expect(m("keep.md")).toBe(false);
	});
});
