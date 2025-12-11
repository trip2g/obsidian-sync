#!/usr/bin/env npx tsx
/**
 * CLI to simulate server-side file edits for E2E testing.
 *
 * Fetches a note from server, appends a string, and pushes it back.
 *
 * Usage:
 *   npx tsx obsidian-sync/src/sync/cli/server-edit.ts --path note.md --append "new line"
 *   npx tsx obsidian-sync/src/sync/cli/server-edit.ts --path note.md --prepend "header"
 *   npx tsx obsidian-sync/src/sync/cli/server-edit.ts --path note.md --replace "old" --with "new"
 */

import { createClient } from "./client";

interface CliArgs {
	path: string;
	apiUrl: string;
	apiKey: string;
	append?: string;
	prepend?: string;
	replaceFrom?: string;
	replaceTo?: string;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const result: CliArgs = {
		path: "",
		apiUrl: process.env.ENDPOINT || "http://localhost:8081/graphql",
		apiKey: process.env.API_KEY || "",
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "--path":
			case "-p":
				result.path = args[++i];
				break;
			case "--api-url":
			case "-u":
				result.apiUrl = args[++i];
				break;
			case "--api-key":
			case "-k":
				result.apiKey = args[++i];
				break;
			case "--append":
			case "-a":
				result.append = args[++i];
				break;
			case "--prepend":
				result.prepend = args[++i];
				break;
			case "--replace":
				result.replaceFrom = args[++i];
				break;
			case "--with":
				result.replaceTo = args[++i];
				break;
			case "--help":
			case "-h":
				printHelp();
				process.exit(0);
		}
	}

	return result;
}

function printHelp(): void {
	console.log(`
server-edit - Simulate server-side file edits for E2E testing

Usage:
  npx tsx obsidian-sync/src/sync/cli/server-edit.ts [options]

Options:
  -p, --path <path>      Note path to edit (required)
  -u, --api-url <url>    GraphQL endpoint (default: $ENDPOINT)
  -k, --api-key <key>    API key (default: $API_KEY)
  -a, --append <text>    Append text to end of file
      --prepend <text>   Prepend text to beginning of file
      --replace <old>    Text to replace (use with --with)
      --with <new>       Replacement text
  -h, --help             Show this help

Examples:
  # Append a line to a note
  npx tsx server-edit.ts --path note.md --append "\\n<!-- edited -->"

  # Prepend a header
  npx tsx server-edit.ts --path note.md --prepend "# New Header\\n"

  # Replace text
  npx tsx server-edit.ts --path note.md --replace "old" --with "new"
`);
}

async function main(): Promise<void> {
	const args = parseArgs();

	if (!args.path) {
		console.error("❌ Error: --path is required");
		printHelp();
		process.exit(1);
	}

	if (!args.apiKey) {
		console.error("❌ Error: --api-key or API_KEY environment variable is required");
		process.exit(1);
	}

	if (!args.append && !args.prepend && !args.replaceFrom) {
		console.error("❌ Error: specify --append, --prepend, or --replace");
		process.exit(1);
	}

	const sdk = createClient({ apiUrl: args.apiUrl, apiKey: args.apiKey });

	// Fetch note content
	console.log(`📥 Fetching ${args.path}...`);
	let content: string | null = null;
	try {
		const result = await sdk.FetchNoteContents({
			filter: { paths: [args.path] },
		});
		const note = result.notePaths.find((np) => np.path === args.path);
		content = note?.content ?? null;
	} catch (e) {
		console.error(`❌ Failed to fetch note: ${e}`);
		process.exit(1);
	}

	if (content === null) {
		console.error(`❌ Note not found: ${args.path}`);
		process.exit(1);
	}

	let newContent = content;

	if (args.append) {
		newContent = content + args.append.replace(/\\n/g, "\n");
		console.log(`📝 Appending text...`);
	} else if (args.prepend) {
		newContent = args.prepend.replace(/\\n/g, "\n") + content;
		console.log(`📝 Prepending text...`);
	} else if (args.replaceFrom && args.replaceTo !== undefined) {
		newContent = content.replace(args.replaceFrom, args.replaceTo);
		console.log(`📝 Replacing "${args.replaceFrom}" with "${args.replaceTo}"...`);
	}

	if (newContent === content) {
		console.log("⚠️ No changes made");
		return;
	}

	// Push changes
	console.log(`📤 Pushing changes...`);
	try {
		const result = await sdk.PushNotes({
			input: {
				updates: [{ path: args.path, content: newContent }],
				skipCommit: false,
			},
		});

		if ("message" in result.pushNotes) {
			throw new Error(`Push failed: ${result.pushNotes.message}`);
		}

		console.log(`✅ Successfully edited ${args.path} on server`);
	} catch (e) {
		console.error(`❌ Failed to push note: ${e}`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("❌ Fatal error:", err);
	process.exit(1);
});
