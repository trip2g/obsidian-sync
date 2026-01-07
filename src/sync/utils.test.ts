import { describe, it, expect } from "vitest";
import { isAlwaysPublishable } from "./utils";

describe("isAlwaysPublishable", () => {
	it("returns true for HTML files in _layouts/", () => {
		expect(isAlwaysPublishable("_layouts/base.html")).toBe(true);
		expect(isAlwaysPublishable("_layouts/post.html")).toBe(true);
		expect(isAlwaysPublishable("_layouts/page.html")).toBe(true);
	});

	it("returns true for HTML files in nested _layouts/ directories", () => {
		expect(isAlwaysPublishable("_layouts/components/header.html")).toBe(true);
		expect(isAlwaysPublishable("_layouts/nested/deep/template.html")).toBe(true);
	});

	it("returns false for non-HTML files in _layouts/", () => {
		expect(isAlwaysPublishable("_layouts/README.md")).toBe(false);
		expect(isAlwaysPublishable("_layouts/style.css")).toBe(false);
		expect(isAlwaysPublishable("_layouts/script.js")).toBe(false);
	});

	it("returns false for HTML files outside _layouts/", () => {
		expect(isAlwaysPublishable("index.html")).toBe(false);
		expect(isAlwaysPublishable("pages/about.html")).toBe(false);
		expect(isAlwaysPublishable("_templates/base.html")).toBe(false);
		expect(isAlwaysPublishable("components/header.html")).toBe(false);
	});

	it("returns false for markdown files", () => {
		expect(isAlwaysPublishable("note.md")).toBe(false);
		expect(isAlwaysPublishable("_layouts/note.md")).toBe(false);
	});

	it("handles edge cases", () => {
		expect(isAlwaysPublishable("")).toBe(false);
		expect(isAlwaysPublishable("_layouts/")).toBe(false);
		expect(isAlwaysPublishable(".html")).toBe(false);
		expect(isAlwaysPublishable("_layouts")).toBe(false);
	});
});
