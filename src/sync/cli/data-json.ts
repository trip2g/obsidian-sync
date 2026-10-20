/**
 * Locating and editing the plugin's data.json from the vault root.
 *
 * The plugin id moved from `trip2g` to `ttgsync`, so data.json may live in
 * either .obsidian/plugins/ttgsync/ or .obsidian/plugins/trip2g/. The new
 * folder wins when both exist: the plugin copies the old file there once and
 * keeps writing only the new one.
 */

import * as fs from "fs";
import * as path from "path";
import { writeFileAtomic } from "./atomic-write";
import type { CommandResult } from "./graphql-cmd";

export const PLUGIN_IDS = ["ttgsync", "trip2g"] as const;

export function findDataJsonPath(vaultRoot: string, exists: (p: string) => boolean): string | null {
	for (const id of PLUGIN_IDS) {
		const p = path.join(vaultRoot, ".obsidian", "plugins", id, "data.json");
		if (exists(p)) return p;
	}
	return null;
}

/**
 * Checks a server base URL like `http://127.0.0.1:8080`. Returns the reason it
 * is rejected, or null. Nothing is normalised: the URL is stored exactly as
 * given, so a near miss is an error rather than a silent rewrite.
 */
export function validateServerUrl(url: string): string | null {
	if (!url) return "url is required";
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return `not a valid URL, expected http or https: ${url}`;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return `expected http or https: ${url}`;
	}
	if (parsed.search || parsed.hash || url.includes("?") || url.includes("#")) {
		return `no query or fragment allowed: ${url}`;
	}
	if (/\/_system(\/|$)/.test(parsed.pathname)) {
		return `give the server base, without /_system/graphql: ${url}`;
	}
	if (url.endsWith("/")) {
		return `remove the trailing slash: ${url}`;
	}
	return null;
}

interface DataJson {
	syncDirs?: Array<Record<string, unknown>>;
	[key: string]: unknown;
}

/** Returns a copy of data with apiUrl set on every syncDirs entry. */
export function setApiUrl(data: DataJson, url: string): { data: DataJson; changed: number; total: number } {
	const dirs = Array.isArray(data.syncDirs) ? data.syncDirs : [];
	let changed = 0;
	const syncDirs = dirs.map((dir) => {
		if (dir.apiUrl === url) return dir;
		changed++;
		return { ...dir, apiUrl: url };
	});
	return { data: { ...data, syncDirs }, changed, total: dirs.length };
}

/** `trip2g-sync update-api-url <url>`, run from the vault root. */
export function runUpdateApiUrl(opts: { cwd: string; url?: string }): CommandResult {
	const url = opts.url ?? "";
	const invalid = validateServerUrl(url);
	if (invalid) {
		return { stdout: "", stderr: `usage: trip2g-sync.mjs update-api-url <url>\n${invalid}`, exitCode: 2 };
	}

	const file = findDataJsonPath(opts.cwd, (p) => fs.existsSync(p));
	if (!file) {
		return {
			stdout: "",
			stderr:
				"no data.json found: looked in .obsidian/plugins/ttgsync/ and .obsidian/plugins/trip2g/ " +
				`under ${opts.cwd}. Run from the vault root.`,
			exitCode: 1,
		};
	}

	let data: DataJson;
	try {
		data = JSON.parse(fs.readFileSync(file, "utf8")) as DataJson;
	} catch (e) {
		return { stdout: "", stderr: `cannot read ${file}: ${(e as Error).message}`, exitCode: 1 };
	}

	const res = setApiUrl(data, url);
	if (res.changed === 0) {
		return { stdout: `apiUrl already ${url} in all ${res.total} syncDirs (${file})`, stderr: "", exitCode: 0 };
	}

	// Same layout as Obsidian's saveData, so the plugin's own writes stay diff-clean.
	writeFileAtomic(file, JSON.stringify(res.data, null, 2));
	return { stdout: `apiUrl set to ${url} in ${res.changed} of ${res.total} syncDirs (${file})`, stderr: "", exitCode: 0 };
}
