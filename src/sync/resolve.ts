/**
 * Asset path resolution following Obsidian's link resolution algorithm.
 * See docs/obsidian_links.md for full specification.
 *
 * Key principle: Root/shortest path wins over relative paths.
 * [[image.png]] resolves to /image.png even when referenced from /folder/note.md
 */

import { posixBasename, posixDirname, posixJoin } from "./utils";

/**
 * Minimal interface for file existence check - easy to mock in tests.
 */
export interface ResolveEnv {
	fileExistsSync(filePath: string): boolean;

	// Every file in the vault, vault-relative and slash-separated. Optional:
	// an env that cannot enumerate files keeps the root/assets/note-folder
	// probes only.
	listVaultFiles?(): string[];
}

/**
 * Pick the file whose basename matches `name`, following Obsidian's shortest
 * path rule: fewer path segments wins, ties broken lexicographically so the
 * result is stable across runs.
 *
 * @param paths - Vault-relative file paths
 * @param name - Bare file name from a wikilink (no /)
 */
export function pickByBasename(paths: string[], name: string): string | null {
	const wanted = name.toLowerCase();

	let best: string | null = null;
	let bestDepth = 0;
	for (const filePath of paths) {
		if (posixBasename(filePath).toLowerCase() !== wanted) {
			continue;
		}
		const depth = filePath.split("/").length;
		if (best === null || depth < bestDepth || (depth === bestDepth && filePath < best)) {
			best = filePath;
			bestDepth = depth;
		}
	}

	return best;
}

/**
 * Resolve wikilink asset path to actual file path in vault.
 *
 * Resolution order (per Obsidian's algorithm):
 * 1. Root first (shortest path priority)
 * 2. Common assets folder
 * 3. Relative to note's directory (last resort)
 *
 * @param env - Environment providing fileExistsSync
 * @param assetPath - Wikilink path (e.g., "image.png")
 * @param notePath - Path of the note containing the link (e.g., "folder/note.md")
 * @returns Resolved path or null if not found
 */
export function resolveAssetPath(
	env: ResolveEnv,
	assetPath: string,
	notePath: string
): string | null {
	// Handle explicit paths (contain /)
	if (assetPath.startsWith("./")) {
		// Explicit relative: ./image.png -> folder/image.png
		const noteDir = posixDirname(notePath);
		const relativePath = posixJoin(noteDir, assetPath.slice(2));
		if (env.fileExistsSync(relativePath)) {
			return relativePath;
		}
		return null;
	}

	if (assetPath.startsWith("/")) {
		// Explicit absolute: /image.png -> image.png
		const absolutePath = assetPath.slice(1);
		if (env.fileExistsSync(absolutePath)) {
			return absolutePath;
		}
		return null;
	}

	if (assetPath.includes("/")) {
		// Explicit path with folder: folder/image.png
		if (env.fileExistsSync(assetPath)) {
			return assetPath;
		}
		return null;
	}

	// Global resolution for simple names (no /)
	// Priority: root > assets > relative (per Obsidian's shortest path rule)

	// 1. Root first (shortest path priority per Obsidian)
	if (env.fileExistsSync(assetPath)) {
		return assetPath;
	}

	// 2. Common assets folder
	const assetsPath = posixJoin("assets", assetPath);
	if (env.fileExistsSync(assetsPath)) {
		return assetsPath;
	}

	// 3. Relative to note's directory
	const noteDir = posixDirname(notePath);
	if (noteDir && noteDir !== ".") {
		const relativePath = posixJoin(noteDir, assetPath);
		if (env.fileExistsSync(relativePath)) {
			return relativePath;
		}
	}

	// 4. Anywhere in the vault (last resort) — Obsidian resolves a bare name
	// globally, so [[img.png]] finds it in any folder, not just those above.
	const vaultFiles = env.listVaultFiles?.();
	if (vaultFiles) {
		return pickByBasename(vaultFiles, assetPath);
	}

	// Not found
	return null;
}
