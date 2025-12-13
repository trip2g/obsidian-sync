import esbuild from "esbuild";
import fs from "fs";
import path from "path";

await esbuild.build({
	entryPoints: ["src/sync/cli/cmd.ts"],
	bundle: true,
	platform: "node",
	target: "node18",
	format: "esm",
	logLevel: "info",
	sourcemap: false,
	treeShaking: true,
	minify: true,
	outfile: "dist/trip2g-sync.mjs",
	alias: {
		// Replace graphql-tag with minimal shim (saves ~150KB)
		"graphql-tag": path.resolve("src/sync/cli/graphql-tag-shim.ts"),
	},
});

// Add shebang at the beginning (esbuild banner doesn't work well with minification)
const content = fs.readFileSync("dist/trip2g-sync.mjs", "utf-8");
fs.writeFileSync("dist/trip2g-sync.mjs", `#!/usr/bin/env node\n${content}`);

console.log("✅ CLI built: dist/trip2g-sync.mjs");
