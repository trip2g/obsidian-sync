import { describe, it, expect } from "vitest";
import * as nodePath from "path";
import {
	isAlwaysPublishable,
	sameOrigin,
	resolveAssetUrl,
	posixBasename,
	posixDirname,
	posixJoin,
} from "./utils";

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

	it("returns true for JSON layout files (.html.json) in _layouts/", () => {
		expect(isAlwaysPublishable("_layouts/page.html.json")).toBe(true);
		expect(isAlwaysPublishable("_layouts/custom/landing.html.json")).toBe(true);
		expect(isAlwaysPublishable("_layouts/nested/deep/template.html.json")).toBe(true);
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

describe("sameOrigin", () => {
	it("returns true for same origin, differing paths (CLI-style apiUrl)", () => {
		expect(
			sameOrigin("http://localhost:20081/graphql", "http://localhost:20081/_system/assets/abc/x.png")
		).toBe(true);
	});

	it("returns true for same origin, differing paths (plugin-style base apiUrl)", () => {
		expect(sameOrigin("http://localhost:20081", "http://localhost:20081/_system/assets/abc/x.png")).toBe(
			true
		);
	});

	it("returns false for different host", () => {
		expect(sameOrigin("http://localhost:20081", "http://evil.example.com/_system/assets/abc/x.png")).toBe(
			false
		);
	});

	it("returns false for different port", () => {
		expect(sameOrigin("http://localhost:20081", "http://localhost:9999/_system/assets/abc/x.png")).toBe(
			false
		);
	});

	it("returns false for different protocol", () => {
		expect(sameOrigin("http://localhost:20081", "https://localhost:20081/_system/assets/abc/x.png")).toBe(
			false
		);
	});

	it("returns false for a relative asset url", () => {
		expect(sameOrigin("http://localhost:20081", "/_system/assets/abc/x.png")).toBe(false);
	});

	it("returns false for an empty asset url", () => {
		expect(sameOrigin("http://localhost:20081", "")).toBe(false);
	});

	it("returns false for a malformed asset url", () => {
		expect(sameOrigin("http://localhost:20081", "not a valid url")).toBe(false);
	});

	it("returns false for an empty apiUrl", () => {
		expect(sameOrigin("", "http://localhost:20081/_system/assets/abc/x.png")).toBe(false);
	});

	it("returns false for a malformed apiUrl", () => {
		expect(sameOrigin("not a valid url", "http://localhost:20081/_system/assets/abc/x.png")).toBe(false);
	});
});

describe("resolveAssetUrl", () => {
	it("returns an absolute http url unchanged", () => {
		expect(resolveAssetUrl("http://localhost:20081/graphql", "http://cdn.example.com/x.png")).toBe(
			"http://cdn.example.com/x.png"
		);
	});

	it("returns an absolute https url unchanged", () => {
		expect(resolveAssetUrl("http://localhost:20081/graphql", "https://cdn.example.com/x.png")).toBe(
			"https://cdn.example.com/x.png"
		);
	});

	it("resolves a relative url against a CLI-style apiUrl (graphql endpoint)", () => {
		expect(resolveAssetUrl("http://localhost:20081/graphql", "/_system/assets/ab/c.png")).toBe(
			"http://localhost:20081/_system/assets/ab/c.png"
		);
	});

	it("resolves a relative url against a plugin-style base apiUrl", () => {
		expect(resolveAssetUrl("http://localhost:20081", "/_system/assets/ab/c.png")).toBe(
			"http://localhost:20081/_system/assets/ab/c.png"
		);
	});

	it("preserves percent-encoded filenames", () => {
		expect(resolveAssetUrl("http://localhost:20081", "/_system/assets/ab/my%20file.png")).toBe(
			"http://localhost:20081/_system/assets/ab/my%20file.png"
		);
	});

	it("returns the url unchanged when apiUrl is empty", () => {
		expect(resolveAssetUrl("", "/_system/assets/ab/c.png")).toBe("/_system/assets/ab/c.png");
	});

	it("returns the url unchanged when apiUrl is malformed", () => {
		expect(resolveAssetUrl("not a valid url", "/_system/assets/ab/c.png")).toBe("/_system/assets/ab/c.png");
	});
});

describe("resolveAssetUrl + sameOrigin (downloadAsset guard chain)", () => {
	it("keeps the api key gated off for a cross-origin absolute url (e.g. a CDN via PublicURL)", () => {
		const apiUrl = "http://localhost:20081/graphql";
		const assetUrl = "https://cdn.example.com/_system/assets/ab/c.png";
		const resolved = resolveAssetUrl(apiUrl, assetUrl);
		expect(resolved).toBe(assetUrl);
		expect(sameOrigin(apiUrl, resolved)).toBe(false);
	});

	it("sends the api key for a relative url resolved back to the same origin as apiUrl", () => {
		const apiUrl = "http://localhost:20081/graphql";
		const assetUrl = "/_system/assets/ab/c.png";
		const resolved = resolveAssetUrl(apiUrl, assetUrl);
		expect(resolved).toBe("http://localhost:20081/_system/assets/ab/c.png");
		expect(sameOrigin(apiUrl, resolved)).toBe(true);
	});
});

// The browser bundle can't import node's "path" (esbuild has nothing to resolve
// it to), so these mirror `path.posix` for vault-relative paths. Each case is
// asserted against node itself, so the two can't drift.
describe("posix path helpers", () => {
	const dirnameCases = ["folder/note.md", "note.md", "a/b/c.md", "", "/a.md", "a/b/"];
	for (const p of dirnameCases) {
		it(`posixDirname(${JSON.stringify(p)}) matches path.posix.dirname`, () => {
			expect(posixDirname(p)).toBe(nodePath.posix.dirname(p));
		});
	}

	const basenameCases = ["folder/image.png", "image.png", "a/b/c.png", ""];
	for (const p of basenameCases) {
		it(`posixBasename(${JSON.stringify(p)}) matches path.posix.basename`, () => {
			expect(posixBasename(p)).toBe(nodePath.posix.basename(p));
		});
	}

	const joinCases: Array<[string, string]> = [
		["folder", "image.png"],
		[".", "image.png"],
		["", "image.png"],
		["assets", "image.png"],
		["a/b", "../image.png"],
		["a", ".."],
		["..", "a"],
		["a/b", "c/d.png"],
	];
	for (const [a, b] of joinCases) {
		it(`posixJoin(${JSON.stringify(a)}, ${JSON.stringify(b)}) matches path.posix.join`, () => {
			expect(posixJoin(a, b)).toBe(nodePath.posix.join(a, b));
		});
	}
});
