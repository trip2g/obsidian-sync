/**
 * Asset path resolution following Obsidian's link resolution algorithm.
 * See docs/obsidian_links.md for full specification.
 *
 * Key principle: Root/shortest path wins over relative paths.
 * [[image.png]] resolves to /image.png even when referenced from /folder/note.md
 */

import * as path from "path";

/**
 * Minimal interface for file existence check - easy to mock in tests.
 */
export interface ResolveEnv {
	fileExistsSync(filePath: string): boolean;
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
		const noteDir = path.dirname(notePath);
		const relativePath = path.join(noteDir, assetPath.slice(2));
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
	const assetsPath = path.posix.join("assets", assetPath);
	if (env.fileExistsSync(assetsPath)) {
		return assetsPath;
	}

	// 3. Relative to note's directory (last resort)
	const noteDir = path.dirname(notePath);
	if (noteDir && noteDir !== ".") {
		const relativePath = path.posix.join(noteDir, assetPath);
		if (env.fileExistsSync(relativePath)) {
			return relativePath;
		}
	}

	// Not found
	return null;
}
