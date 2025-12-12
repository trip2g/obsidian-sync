#!/usr/bin/env npx ts-node
/**
 * CLI for obsidian-sync
 *
 * Usage:
 *   npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx
 *   npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --two-way
 *
 * Environment variables:
 *   API_KEY     - API key (alternative to --api-key)
 *   ENDPOINT    - GraphQL endpoint (alternative to --api-url)
 */

import { NodeEnv, type CliConflictResolution } from "./env";
import { classifySync } from "../classify";
import { filterPlan } from "../filter";
import { executePlan } from "../execute";

interface CliArgs {
	folder: string;
	apiUrl: string;
	apiKey: string;
	twoWaySync: boolean;
	verbose: boolean;
	dryRun: boolean;
	conflictResolution: CliConflictResolution;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const result: CliArgs = {
		folder: "",
		apiUrl: process.env.ENDPOINT || "http://localhost:8081/graphql",
		apiKey: process.env.API_KEY || "",
		twoWaySync: false,
		verbose: false,
		dryRun: false,
		conflictResolution: "local",
	};

	for (let i = 0; i < args.length; i++) {
		let arg = args[i];
		let value: string | undefined;

		// Handle --arg=value syntax
		if (arg.includes("=")) {
			const eqIndex = arg.indexOf("=");
			value = arg.substring(eqIndex + 1);
			arg = arg.substring(0, eqIndex);
		}

		switch (arg) {
			case "--folder":
			case "-f":
				result.folder = value ?? args[++i];
				break;
			case "--api-url":
			case "-u":
				result.apiUrl = value ?? args[++i];
				break;
			case "--api-key":
			case "-k":
				result.apiKey = value ?? args[++i];
				break;
			case "--two-way":
			case "-2":
				result.twoWaySync = true;
				break;
			case "--verbose":
			case "-v":
				result.verbose = true;
				break;
			case "--dry-run":
			case "-n":
				result.dryRun = true;
				break;
			case "--conflict-resolution":
			case "-c":
				const crValue = value ?? args[++i];
				if (crValue === "local" || crValue === "remote" || crValue === "skip" || crValue === "fail") {
					result.conflictResolution = crValue;
				} else {
					console.error(`❌ Invalid conflict resolution: ${crValue}. Use: local, remote, skip, fail`);
					process.exit(1);
				}
				break;
			case "--help":
			case "-h":
				printHelp();
				process.exit(0);
			default:
				// First positional arg is folder
				if (!result.folder && !arg.startsWith("-")) {
					result.folder = arg;
				}
		}
	}

	return result;
}

function printHelp(): void {
	console.log(`
obsidian-sync CLI

Usage:
  npx ts-node src/sync/cli/cmd.ts [options] [folder]

Options:
  -f, --folder <path>      Folder to sync (required)
  -u, --api-url <url>      GraphQL endpoint (default: $ENDPOINT or http://localhost:8081/graphql)
  -k, --api-key <key>      API key (default: $API_KEY)
  -2, --two-way            Enable two-way sync (pull changes from server)
  -c, --conflict-resolution <mode>
                           How to resolve conflicts (default: local)
                           - local:  Keep local version, push to server
                           - remote: Keep remote version, overwrite local
                           - skip:   Skip conflicting files
                           - fail:   Exit with error on first conflict
  -v, --verbose            Verbose output
  -n, --dry-run            Show what would be done without making changes
  -h, --help               Show this help

Environment Variables:
  ENDPOINT    GraphQL endpoint URL
  API_KEY     API key for authentication

Examples:
  # Push-only sync (like push_notes.py)
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx

  # Two-way sync
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --two-way

  # Two-way sync, fail on conflicts (for CI)
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --two-way -c fail

  # Dry run to see what would happen
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --dry-run
`);
}

async function main(): Promise<void> {
	const args = parseArgs();

	// Validate required args
	if (!args.folder) {
		console.error("❌ Error: --folder is required");
		printHelp();
		process.exit(1);
	}

	if (!args.apiKey) {
		console.error("❌ Error: --api-key or API_KEY environment variable is required");
		process.exit(1);
	}

	console.log("=".repeat(60));
	console.log("obsidian-sync CLI");
	console.log("=".repeat(60));
	console.log(`Folder:     ${args.folder}`);
	console.log(`API URL:    ${args.apiUrl}`);
	console.log(`Two-way:    ${args.twoWaySync}`);
	console.log(`Conflicts:  ${args.conflictResolution}`);
	console.log(`Dry run:    ${args.dryRun}`);
	console.log("=".repeat(60));

	// Create env
	const env = new NodeEnv({
		folder: args.folder,
		apiUrl: args.apiUrl,
		apiKey: args.apiKey,
		twoWaySync: args.twoWaySync,
		verbose: args.verbose,
		conflictResolution: args.conflictResolution,
	});

	// 1. Classify files
	console.log("\n📊 Classifying files...");
	const plan = await classifySync(env);

	// 2. Filter plan based on options
	const filteredPlan = filterPlan(plan, {
		twoWaySync: args.twoWaySync,
	});

	// 3. Print summary
	console.log("\n📋 Sync Plan:");
	console.log("-".repeat(40));
	console.log(`  Unchanged:      ${filteredPlan.unchanged}`);
	console.log(`  To push:        ${filteredPlan.pushes.length}`);
	console.log(`  Local only:     ${filteredPlan.localOnly.length}`);
	console.log(`  To pull:        ${filteredPlan.pulls.length}`);
	console.log(`  Remote only:    ${filteredPlan.remoteOnly.length}`);
	console.log(`  Conflicts:      ${filteredPlan.conflicts.length}`);
	console.log(`  Local deleted:  ${filteredPlan.localDeleted.length}`);
	console.log(`  Server deleted: ${filteredPlan.serverDeleted.length}`);
	console.log("-".repeat(40));

	// Print details if verbose
	if (args.verbose) {
		if (filteredPlan.pushes.length > 0) {
			console.log("\n📤 Files to push:");
			for (const f of filteredPlan.pushes) {
				console.log(`  ${f.path}`);
			}
		}
		if (filteredPlan.localOnly.length > 0) {
			console.log("\n🆕 New local files:");
			for (const f of filteredPlan.localOnly) {
				console.log(`  ${f.path}`);
			}
		}
		if (filteredPlan.pulls.length > 0) {
			console.log("\n📥 Files to pull:");
			for (const f of filteredPlan.pulls) {
				console.log(`  ${f.path}`);
			}
		}
		if (filteredPlan.remoteOnly.length > 0) {
			console.log("\n🌐 New remote files:");
			for (const f of filteredPlan.remoteOnly) {
				console.log(`  ${f.path}`);
			}
		}
		if (filteredPlan.localDeleted.length > 0) {
			console.log("\n🗑️ To hide on server:");
			for (const f of filteredPlan.localDeleted) {
				console.log(`  ${f.path}`);
			}
		}
	}

	// 4. Execute if not dry run
	if (args.dryRun) {
		console.log("\n⏸️ Dry run - no changes made");
		return;
	}

	const totalActions =
		filteredPlan.pushes.length +
		filteredPlan.localOnly.length +
		filteredPlan.pulls.length +
		filteredPlan.remoteOnly.length +
		filteredPlan.conflicts.length +
		filteredPlan.localDeleted.length +
		filteredPlan.serverDeleted.length;

	if (totalActions === 0) {
		// Still save sync state to establish baseline for unchanged files
		await env.saveSyncState(env.getSyncState());
		console.log("\n✅ Everything is up to date!");
		return;
	}

	console.log("\n🚀 Executing sync...");
	const result = await executePlan(env, filteredPlan, { twoWaySync: args.twoWaySync });

	// 5. Print results
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
	console.log("=".repeat(60));
}

main().catch((err) => {
	console.error("❌ Fatal error:", err);
	process.exit(1);
});
