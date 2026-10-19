import * as fs from "fs";
import type { SyncResult } from "../types";

/** The exit code of every failed run, a partial failure included. */
export const EXIT_FAILURE = 1;

/**
 * Print what a sync did and return the exit code: EXIT_FAILURE when any
 * operation failed or a layout has a critical warning, after the summary is
 * printed, so a script sees the failure and a reader sees what did succeed.
 */
export function printSyncResult(result: SyncResult, totalActions: number, updatedOutput: string): number {
	const upToDate =
		totalActions === 0 && result.assetsUploaded === 0 && result.assetsDownloaded === 0 && result.errors.length === 0;
	if (upToDate) {
		console.log("\n✅ Everything is up to date!");
		return 0;
	}

	// Print results
	console.log("\n" + "=".repeat(60));
	console.log("📊 SYNC RESULTS:");
	console.log("=".repeat(60));
	console.log(`  Pushed:             ${result.pushed}`);
	console.log(`  Pulled:             ${result.pulled}`);
	console.log(`  Conflicts resolved: ${result.conflictsResolved}`);
	console.log(`  Assets uploaded:    ${result.assetsUploaded}`);
	console.log(`  Assets downloaded:  ${result.assetsDownloaded}`);
	if (result.errors.length > 0) {
		console.log(`  Errors:             ${result.errors.length}`);
		for (const err of result.errors) {
			console.log(`    ❌ ${err}`);
		}
	}
	if (result.warnings.length > 0) {
		console.log(`  Warnings:           ${result.warnings.length}`);
	}
	console.log("=".repeat(60));

	// Print warnings grouped by file. A layout that fails to parse or render
	// (Critical) syncs but is unusable at render time, so it must fail the CLI
	// run loudly here instead of surfacing only when a visitor hits the page.
	let hasCritical = false;
	if (result.warnings.length > 0) {
		const RED = "\x1b[31m";
		const YELLOW = "\x1b[33m";
		const RESET = "\x1b[0m";
		const byPath = new Map<string, typeof result.warnings>();
		for (const w of result.warnings) {
			const forPath = byPath.get(w.path) ?? [];
			forPath.push(w);
			byPath.set(w.path, forPath);
		}
		console.log("\n⚠️  Warnings:");
		for (const [path, warnings] of byPath) {
			console.log(`  ${path}`);
			for (const w of warnings) {
				const isCritical = w.level === "CRITICAL";
				hasCritical = hasCritical || isCritical;
				const color = isCritical ? RED : YELLOW;
				console.log(`    ${color}[${w.level}]${RESET} ${w.message}`);
			}
		}
	}

	// Print updated URLs
	const updatedUrls = result.updatedUrls ?? [];
	if (updatedUrls.length > 0) {
		console.log("\n📎 Published:");
		if (updatedUrls.length <= 20) {
			for (const { path, url } of updatedUrls) {
				console.log(`  ${path} → ${url}`);
			}
		}
		if (updatedOutput) {
			fs.writeFileSync(updatedOutput, JSON.stringify(updatedUrls, null, 2));
			console.log(`💾 Saved to ${updatedOutput}`);
		} else {
			console.log(`💡 --updated-output $(mktemp /tmp/updated-XXXXXX.json)`);
		}
	}

	if (hasCritical) {
		console.error("\n❌ Critical warnings detected, aborting.");
		return EXIT_FAILURE;
	}
	if (result.errors.length > 0) {
		console.error(`\n❌ ${result.errors.length} operation(s) failed; they stay unsynced and are retried on the next run.`);
		return EXIT_FAILURE;
	}
	return 0;
}
