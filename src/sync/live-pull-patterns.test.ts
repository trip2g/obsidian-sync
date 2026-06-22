import { describe, it, expect } from "vitest";
import { resolveLivePullPatterns } from "./live-pull-patterns";

describe("resolveLivePullPatterns", () => {
	describe("include patterns", () => {
		it("flags win over data.json include patterns", () => {
			const result = resolveLivePullPatterns({
				flagInclude: ["notes/**"],
				flagExclude: [],
				dataInclude: ["blog/**"],
				dataExclude: [],
			});
			expect(result.include).toEqual(["notes/**"]);
		});

		it("data.json include patterns used when no flags", () => {
			const result = resolveLivePullPatterns({
				flagInclude: [],
				flagExclude: [],
				dataInclude: ["blog/**", "posts/**"],
				dataExclude: [],
			});
			expect(result.include).toEqual(["blog/**", "posts/**"]);
		});

		it("empty everywhere with watch -> [**]", () => {
			const result = resolveLivePullPatterns({
				flagInclude: [],
				flagExclude: [],
				dataInclude: [],
				dataExclude: [],
			});
			expect(result.include).toEqual(["**"]);
		});

		it("non-empty flag include overrides non-empty data include", () => {
			const result = resolveLivePullPatterns({
				flagInclude: ["specific/**"],
				flagExclude: [],
				dataInclude: ["data/**"],
				dataExclude: [],
			});
			expect(result.include).toEqual(["specific/**"]);
		});
	});

	describe("exclude patterns", () => {
		it("flags win over data.json exclude patterns", () => {
			const result = resolveLivePullPatterns({
				flagInclude: [],
				flagExclude: ["dev/**"],
				dataInclude: [],
				dataExclude: ["drafts/**"],
			});
			expect(result.exclude).toEqual(["dev/**"]);
		});

		it("data.json exclude patterns used when no flags", () => {
			const result = resolveLivePullPatterns({
				flagInclude: [],
				flagExclude: [],
				dataInclude: [],
				dataExclude: ["drafts/**", "private/**"],
			});
			expect(result.exclude).toEqual(["drafts/**", "private/**"]);
		});

		it("empty exclude flags and empty data.json -> empty exclude", () => {
			const result = resolveLivePullPatterns({
				flagInclude: [],
				flagExclude: [],
				dataInclude: [],
				dataExclude: [],
			});
			expect(result.exclude).toEqual([]);
		});

		it("exclude passthrough from flags", () => {
			const result = resolveLivePullPatterns({
				flagInclude: [],
				flagExclude: ["*.tmp", "dev"],
				dataInclude: [],
				dataExclude: [],
			});
			expect(result.exclude).toEqual(["*.tmp", "dev"]);
		});
	});

	describe("combined precedence", () => {
		it("flags take priority over data.json for both include and exclude", () => {
			const result = resolveLivePullPatterns({
				flagInclude: ["flag-include/**"],
				flagExclude: ["flag-exclude/**"],
				dataInclude: ["data-include/**"],
				dataExclude: ["data-exclude/**"],
			});
			expect(result.include).toEqual(["flag-include/**"]);
			expect(result.exclude).toEqual(["flag-exclude/**"]);
		});

		it("can use data.json include but flag exclude", () => {
			const result = resolveLivePullPatterns({
				flagInclude: [],
				flagExclude: ["dev"],
				dataInclude: ["blog/**"],
				dataExclude: ["drafts/**"],
			});
			expect(result.include).toEqual(["blog/**"]);
			expect(result.exclude).toEqual(["dev"]);
		});
	});
});
