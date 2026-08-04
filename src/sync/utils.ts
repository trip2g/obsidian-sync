/**
 * Check if a file should always be publishable regardless of publishFields setting.
 * 
 * Currently includes:
 * - HTML files from _layouts/ directory (templates and layouts)
 * 
 * @param path - File path relative to sync folder
 * @returns true if file should always be published
 */
export function isAlwaysPublishable(path: string): boolean {
	// HTML files from _layouts/ are always publishable (templates/layouts)
	// Includes both .html and .html.json (JSON layout format)
	if (path.startsWith("_layouts/") && (path.endsWith(".html") || path.endsWith(".html.json"))) {
		return true;
	}

	return false;
}

/**
 * `path.posix` equivalents for vault-relative paths. Node's `path` can't be
 * bundled for the browser build (esbuild has nothing to resolve it to), and on
 * Windows `path.join`/`path.dirname` would treat `\` as a separator — vault
 * paths are always slash-separated. Absolute paths aren't part of the contract.
 */
export function posixBasename(p: string): string {
	return p.slice(p.lastIndexOf("/") + 1);
}

export function posixDirname(p: string): string {
	const trimmed = p.replace(/\/+$/, "");
	const cut = trimmed.lastIndexOf("/");
	if (cut < 0) return ".";
	if (cut === 0) return "/";
	return trimmed.slice(0, cut);
}

export function posixJoin(...parts: string[]): string {
	const segments: string[] = [];
	for (const segment of parts.join("/").split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === ".." && segments.length > 0 && segments[segments.length - 1] !== "..") {
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return segments.join("/") || ".";
}

/**
 * Check whether an asset url shares the origin (protocol+host+port) of the client's apiUrl.
 * Used to gate sending the API key: it must never leak to a third-party host that
 * PublicURL-absolutized asset urls could point to. Fails closed on malformed/relative input.
 *
 * @param apiUrl - Client's configured API URL (CLI: full graphql endpoint; plugin: base URL)
 * @param assetUrl - Absolute asset URL to compare against
 */
export function sameOrigin(apiUrl: string, assetUrl: string): boolean {
	try {
		return new URL(apiUrl).origin === new URL(assetUrl).origin;
	} catch {
		return false;
	}
}

/**
 * The backend leaves note-asset urls relative (e.g. `/_system/assets/...`) when
 * PublicURL isn't configured (it's optional), so the client must resolve them itself
 * against apiUrl before fetching — otherwise `fetch`/`requestUrl` throws on the bare path.
 *
 * @param apiUrl - Client's configured API URL (CLI: full graphql endpoint; plugin: base URL)
 * @param url - Asset url as received from the server, absolute or relative
 */
export function resolveAssetUrl(apiUrl: string, url: string): string {
	try {
		new URL(url);
		return url;
	} catch {
		// url is relative, fall through to resolve against apiUrl
	}
	try {
		return new URL(url, apiUrl).toString();
	} catch {
		return url;
	}
}
