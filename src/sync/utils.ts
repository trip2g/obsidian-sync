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
