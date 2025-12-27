import esbuild from "esbuild";
import path from "path";

const isWatch = process.argv.includes("--watch");

// ESM bundle for standalone usage
const esmConfig = {
	entryPoints: ["src/sync/browser/index.ts"],
	bundle: true,
	platform: "browser",
	target: "es2020",
	format: "esm",
	logLevel: "info",
	sourcemap: true,
	treeShaking: true,
	minify: !isWatch,
	outfile: "dist/browser-sync.mjs",
	external: [],
};

// IIFE bundle for MAM/require() usage
// Exports to global $trip2g_sync_bundle
const iifeConfig = {
	entryPoints: ["src/sync/browser/index.ts"],
	bundle: true,
	platform: "browser",
	target: "es2020",
	format: "iife",
	globalName: "$trip2g_sync_bundle",
	logLevel: "info",
	sourcemap: false,
	treeShaking: true,
	minify: false,
	outfile: path.resolve("../assets/ui/sync/browser-sync.js"),
	external: [],
};

if (isWatch) {
	const ctx = await esbuild.context(esmConfig);
	await ctx.watch();
	console.log("👀 Watching for changes...");
} else {
	await esbuild.build(esmConfig);
	console.log("✅ ESM bundle built: dist/browser-sync.mjs");

	await esbuild.build(iifeConfig);
	console.log("✅ IIFE bundle built: ../assets/ui/sync/browser-sync.js");
	console.log("📝 Types: ../assets/ui/sync/browser-sync.bundle.d.ts (manual)");
}
