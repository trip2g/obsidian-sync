/**
 * CLI for obsidian-sync
 *
 * Usage:
 *   npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx
 *   npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --two-way
 *
 * Environment variables:
 *   TRIP2G_API_KEY   - API key (alternative to --api-key)
 *   TRIP2G_ENDPOINT  - GraphQL endpoint (alternative to --api-url)
 *   API_KEY          - fallback for TRIP2G_API_KEY
 *   ENDPOINT         - fallback for TRIP2G_ENDPOINT
 */

import * as fs from "fs";
import * as path from "path";
import { NodeEnv, type CliConflictResolution } from "./env";
import { createClient } from "./client";
import { classifySync } from "../classify";
import { filterPlan } from "../filter";
import { executePlan } from "../execute";
import { makeExcludeMatcher } from "../exclude";
import { summarizePrune, pruneNeedsForce } from "../prune";
import { runWatch } from "./watch";

interface CliArgs {
	folder: string;
	prefix: string;
	apiUrl: string;
	apiKey: string;
	twoWaySync: boolean;
	watch: boolean;
	verbose: boolean;
	dryRun: boolean;
	prune: boolean;
	force: boolean;
	conflictResolution: CliConflictResolution;
	meta: Record<string, string>;
	updatedOutput: string;
	exclude: string[];
	include: string[];
	stateFile: string;
}

function readDataJson(): {
	apiUrl?: string;
	apiKey?: string;
	livePullIncludePatterns?: string[];
	livePullExcludePatterns?: string[];
} {
	try {
		const dataPath = path.join(process.cwd(), ".obsidian", "plugins", "trip2g", "data.json");
		const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
		const dir = data?.syncDirs?.[0];
		if (!dir) return {};
		return {
			apiUrl: dir.apiUrl ? `${dir.apiUrl}/_system/graphql` : undefined,
			apiKey: dir.apiKey || undefined,
			livePullIncludePatterns: dir.livePullIncludePatterns ?? undefined,
			livePullExcludePatterns: dir.livePullExcludePatterns ?? undefined,
		};
	} catch {
		return {};
	}
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const dataJson = readDataJson();
	const result: CliArgs = {
		folder: "",
		prefix: "",
		apiUrl: process.env.TRIP2G_ENDPOINT || process.env.ENDPOINT || dataJson.apiUrl || "http://localhost:8081/_system/graphql",
		apiKey: process.env.TRIP2G_API_KEY || process.env.API_KEY || dataJson.apiKey || "",
		twoWaySync: false,
		watch: false,
		verbose: false,
		dryRun: false,
		prune: false,
		force: false,
		conflictResolution: "local",
		meta: {},
		updatedOutput: "",
		exclude: [],
		include: [],
		stateFile: "",
	};

	const positionalArgs: string[] = [];

	for (let i = 0; i < args.length; i++) {
		let arg = args[i];
		let value: string | undefined;

		// Handle --arg=value syntax
		if (arg.includes("=") && arg.startsWith("-")) {
			const eqIndex = arg.indexOf("=");
			value = arg.substring(eqIndex + 1);
			arg = arg.substring(0, eqIndex);
		}

		switch (arg) {
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
			case "--watch":
			case "-w":
				result.watch = true;
				result.twoWaySync = true;
				break;
			case "--include":
			case "-i": {
				const includeValue = value ?? args[++i];
				if (includeValue) {
					result.include.push(includeValue);
				}
				break;
			}
			case "--verbose":
			case "-v":
				result.verbose = true;
				break;
			case "--dry-run":
			case "-n":
				result.dryRun = true;
				break;
			case "--prune":
			case "--mirror":
				result.prune = true;
				break;
			case "--force":
				result.force = true;
				break;
			case "--conflict-resolution":
			case "-c": {
				const crValue = value ?? args[++i];
				if (crValue === "local" || crValue === "remote" || crValue === "skip" || crValue === "fail") {
					result.conflictResolution = crValue;
				} else {
					console.error(`❌ Invalid conflict resolution: ${crValue}. Use: local, remote, skip, fail`);
					process.exit(1);
				}
				break;
			}
			case "--meta":
			case "-m": {
				const metaValue = value ?? args[++i];
				if (metaValue && metaValue.includes("=")) {
					const eqIndex = metaValue.indexOf("=");
					const metaKey = metaValue.substring(0, eqIndex);
					const metaVal = metaValue.substring(eqIndex + 1);
					result.meta[metaKey] = metaVal;
				} else {
					console.error(`❌ Invalid --meta format: ${metaValue}. Use: --meta key=value`);
					process.exit(1);
				}
				break;
			}
			case "--updated-output":
			case "-o":
				result.updatedOutput = value ?? args[++i];
				break;
			case "--state-file":
			case "-s":
				result.stateFile = value ?? args[++i];
				break;
			case "--exclude":
			case "-x": {
				const excludeValue = value ?? args[++i];
				if (excludeValue) {
					result.exclude.push(excludeValue);
				}
				break;
			}
			case "--help":
			case "-h":
				printHelp();
				process.exit(0);
				break;
			default:
				// Collect positional args
				if (!arg.startsWith("-")) {
					positionalArgs.push(arg);
				}
		}
	}

	// Assign positional args: folder [prefix]
	if (positionalArgs.length >= 1) {
		result.folder = positionalArgs[0];
	}
	if (positionalArgs.length >= 2) {
		result.prefix = positionalArgs[1];
	}

	return result;
}

function printHelp(): void {
	console.log(`
obsidian-sync CLI

Usage:
  npx ts-node src/sync/cli/cmd.ts [options] <folder> [prefix]

Arguments:
  folder                   Local folder to sync (required)
  prefix                   Remote path prefix (optional, for multi-repo setups)

Options:
  -u, --api-url <url>      GraphQL endpoint (default: $ENDPOINT or .obsidian/plugins/trip2g/data.json or http://localhost:8081/_system/graphql)
  -k, --api-key <key>      API key (default: $API_KEY)
  -2, --two-way            Enable two-way sync (pull changes from server)
  -w, --watch              Watch mode: stream live changes from server via SSE
                           (implies --two-way; prefix not allowed in this mode)
  -i, --include <glob>     Include only matching paths in live-pull (can be repeated).
                           Flags take priority over data.json livePullIncludePatterns.
                           Default when none specified: ** (follow everything)
  -c, --conflict-resolution <mode>
                           How to resolve conflicts (default: local)
                           - local:  Keep local version, push to server
                           - remote: Keep remote version, overwrite local
                           - skip:   Skip conflicting files
                           - fail:   Exit with error on first conflict
  -m, --meta <key=value>   Add/override frontmatter field for all files (can be repeated)
  -o, --updated-output <file>
                           Write pushed notes as JSON [{path, url}] to file after sync
  -s, --state-file <path>  Sync-state file path (default: .sync-state.<host>.json derived from --api-url)
  -x, --exclude <glob>     Exclude paths from sync (can be repeated). Excluded
                           paths are never pushed; if they exist on the server
                           they are hidden. A bare name like "dev" matches that
                           directory and everything under it. In --watch mode,
                           flags take priority over data.json livePullExcludePatterns.
                           Default: none.
      --prune, --mirror    Server-truth deletion (rsync --delete semantics):
                           hide every server note under the synced prefix that
                           is NOT present locally, even ones the local
                           sync-state has no record of. Fixes orphaned server
                           notes left behind after a sync-state reset/replace
                           (they are classified remote_only and normally
                           ignored, so they are never hidden). Opt-in; without
                           it behavior is 100% unchanged. Prints a loud summary
                           before hiding and honors --dry-run. Refuses to run
                           when the local tree is empty but the server has notes
                           (partial/reset copy) unless --force is also given.
      --force              Allow --prune even when the local tree looks empty.
  -v, --verbose            Verbose output
  -n, --dry-run            Show what would be done without making changes
  -h, --help               Show this help

Environment Variables:
  TRIP2G_ENDPOINT    GraphQL endpoint URL
  TRIP2G_API_KEY     API key for authentication
  ENDPOINT           Fallback for TRIP2G_ENDPOINT
  API_KEY            Fallback for TRIP2G_API_KEY

Examples:
  # Push-only sync
  trip2g-sync ./vault --api-key xxx

  # Two-way sync
  trip2g-sync ./vault --api-key xxx --two-way

  # Exclude folders from a publish (they get hidden on the server if present)
  trip2g-sync ./docs --exclude dev --exclude demo

  # Mirror: hide any server note not present locally (orphaned-note cleanup)
  trip2g-sync ./docs --prune --dry-run   # preview what would be hidden
  trip2g-sync ./docs --prune             # actually hide them

  # Multi-repo setup: each repo pushes to different folder with different meta
  trip2g-sync ./docs docs --meta subgraph=docs
  trip2g-sync ./blog blog --meta subgraph=blog
  trip2g-sync ./wiki wiki --meta subgraph=team-wiki
`);
}

async function cmdWarnings(): Promise<void> {
	const dataJson = readDataJson();
	const apiUrl = process.env.TRIP2G_ENDPOINT || process.env.ENDPOINT || dataJson.apiUrl || "http://localhost:8081/_system/graphql";
	const apiKey = process.env.TRIP2G_API_KEY || process.env.API_KEY || dataJson.apiKey || "";
	if (!apiKey) {
		console.error("❌ TRIP2G_API_KEY or API_KEY required");
		process.exit(1);
	}
	const sdk = createClient({ apiUrl, apiKey });
	const data = await sdk.FetchAllWarnings();
	const result: Array<{ path: string; level: string; message: string; url: string }> = [];
	for (const item of data.notePaths) {
		const view = item.latestNoteView;
		if (!view) continue;
		for (const w of (view.warnings ?? [])) {
			result.push({ path: item.path, level: w.level, message: w.message, url: view.url ?? "" });
		}
	}
	console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
	if (process.argv[2] === "warnings") {
		await cmdWarnings();
		return;
	}

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

	if (args.prefix && args.twoWaySync) {
		console.error("❌ Error: prefix is not supported with --two-way sync");
		process.exit(1);
	}

	if (args.watch) {
		const dataJson = readDataJson();
		const { exitCode } = await runWatch({
			folder: args.folder,
			apiUrl: args.apiUrl,
			apiKey: args.apiKey,
			include: args.include,
			exclude: args.exclude,
			conflictResolution: args.conflictResolution,
			meta: args.meta,
			verbose: args.verbose,
			dataInclude: dataJson.livePullIncludePatterns,
			dataExclude: dataJson.livePullExcludePatterns,
		});
		process.exit(exitCode);
	}

	if (args.dryRun) {
		console.log(`[dry-run] folder=${args.folder}${args.prefix ? ` prefix=${args.prefix}` : ""}`);
	}

	// Create env
	const env = new NodeEnv({
		folder: args.folder,
		prefix: args.prefix,
		apiUrl: args.apiUrl,
		apiKey: args.apiKey,
		twoWaySync: args.twoWaySync,
		verbose: args.verbose,
		conflictResolution: args.conflictResolution,
		meta: args.meta,
		stateFile: args.stateFile || undefined,
	});

	// 1. Classify files
	console.log("\n📊 Classifying files...");
	const plan = await classifySync(env);

	// 2. Filter plan based on options
	const isExcluded = makeExcludeMatcher(args.exclude);
	const filteredPlan = filterPlan(plan, {
		twoWaySync: args.twoWaySync,
		prune: args.prune,
		isExcluded,
	});

	if (args.exclude.length > 0) {
		console.log(`🚫 Excluding: ${args.exclude.join(", ")}`);
	}

	// Prune (server-truth deletion): loud summary + empty-local-tree guard.
	if (args.prune) {
		const summary = summarizePrune(plan, filteredPlan);
		console.log(`\n🪓 PRUNE: ${summary.paths.length} server notes not present locally will be hidden:`);
		for (const p of summary.paths) {
			console.log(`  ${p}`);
		}
		if (!args.force && pruneNeedsForce(summary)) {
			console.error(
				`\n❌ Refusing to prune: 0 local notes under the synced prefix but ${summary.serverPresent} on the server.\n` +
					`   This looks like a partial or reset local copy — pruning would wipe the server.\n` +
					`   Re-run with --force if this is intentional.`
			);
			// In --dry-run keep previewing; otherwise refuse before any hide.
			if (!args.dryRun) {
				process.exit(1);
			}
		}
	}

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

	// Always execute plan - even when no note changes, we need to check for missing assets
	console.log("\n🚀 Executing sync...");
	const result = await executePlan(env, filteredPlan, { twoWaySync: args.twoWaySync });

	if (totalActions === 0 && result.assetsUploaded === 0 && result.assetsDownloaded === 0) {
		console.log("\n✅ Everything is up to date!");
		return;
	}

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
	if (result.warnings.length > 0) {
		console.log(`  Warnings:           ${result.warnings.length}`);
		for (const w of result.warnings) {
			console.log(`    ⚠️  [${w.level}] ${w.path}: ${w.message}`);
		}
	}
	console.log("=".repeat(60));

	// 6. Print updated URLs
	const updatedUrls = result.updatedUrls ?? [];
	if (updatedUrls.length > 0) {
		console.log("\n📎 Published:");
		if (updatedUrls.length <= 20) {
			for (const { path, url } of updatedUrls) {
				console.log(`  ${path} → ${url}`);
			}
		}
		if (args.updatedOutput) {
			fs.writeFileSync(args.updatedOutput, JSON.stringify(updatedUrls, null, 2));
			console.log(`💾 Saved to ${args.updatedOutput}`);
		} else {
			console.log(`💡 --updated-output $(mktemp /tmp/updated-XXXXXX.json)`);
		}
	}
}

main().catch((err) => {
	console.error("❌ Fatal error:", err);
	process.exit(1);
});
