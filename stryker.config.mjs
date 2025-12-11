/** @type {import('@stryker-mutator/api').PartialStrykerOptions} */
export default {
	packageManager: "npm",
	testRunner: "vitest",
	// Disable typescript checker due to node_modules type conflicts
	checkers: [],
	mutate: [
		"src/sync/**/*.ts",
		"!src/sync/**/*.test.ts",
		"!src/sync/cli/**/*.ts", // Exclude CLI (not written yet)
	],
	reporters: ["html", "clear-text", "progress"],
	coverageAnalysis: "perTest",
	timeoutMS: 10000,
};
