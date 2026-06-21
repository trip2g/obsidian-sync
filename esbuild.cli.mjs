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

// Propagate the runnable CLI into the vault plugin dirs so agents can run it as
// `.obsidian/plugins/trip2g/trip2g-sync.mjs` and the docs vault is testable
// immediately. realpath normalizes the symlinked docs plugin dir to this repo.
const root = fs.realpathSync(process.cwd());
const targets = [
	// Plugin root === docs vault's .obsidian/plugins/trip2g (symlink to this repo).
	path.join(root, "trip2g-sync.mjs"),
	// Embedded onboarding vault (sibling of this submodule in the trip2g monorepo).
	path.resolve(root, "../onboarding-vault/.obsidian/plugins/trip2g/trip2g-sync.mjs"),
];
for (const target of targets) {
	if (!fs.existsSync(path.dirname(target))) continue; // standalone build: skip missing vaults
	fs.copyFileSync("dist/trip2g-sync.mjs", target);
	fs.chmodSync(target, 0o755);
	console.log(`✅ Propagated CLI → ${path.relative(root, target)}`);
}
