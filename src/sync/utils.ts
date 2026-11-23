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
 * True when `p` is a vault-relative, slash-separated path that stays inside the
 * vault: no empty path, NUL, backslash, leading slash, drive letter, `..` or
 * service segment (`.obsidian`, `.git`, `.trash`, `.sync-state*`). Other dot
 * folders such as `.attachments` are ordinary content.
 */
export function isSafeVaultPath(p: string, configDir?: string): boolean {
	if (p === "" || p.includes("\0") || p.includes("\\") || p.startsWith("/") || /^[A-Za-z]:/.test(p)) {
		return false;
	}
	return p.split("/").every((segment) => segment !== ".." && !isServiceSegment(segment, configDir));
}

const SERVICE_NAMES = new Set([".obsidian", ".git", ".trash"]);

/**
 * The name a case-insensitive or Unicode-normalising filesystem would give a
 * path segment: lowercase, NFC, cut at an alternate-data-stream colon, trailing
 * dots and spaces dropped.
 */
function normalizeSegment(segment: string): string {
	const base = segment.normalize("NFC").toLowerCase();
	const colon = base.indexOf(":");
	return (colon < 0 ? base : base.slice(0, colon)).replace(/[. ]+$/, "");
}

/**
 * Names the sync itself or the editor owns: configuration (including a custom
 * `configDir`), repository data, trash, sync state. Compared in every spelling
 * the filesystem may treat as the same name.
 */
export function isServiceSegment(segment: string, configDir?: string): boolean {
	const name = normalizeSegment(segment);
	if (SERVICE_NAMES.has(name) || name.startsWith(".sync-state")) {
		return true;
	}
	return configDir !== undefined && configDir !== "" && name === normalizeSegment(configDir);
}

export class PathOutsideVaultError extends Error {
	constructor(relativePath: string) {
		super(`Path is outside the vault: ${JSON.stringify(relativePath)}`);
		this.name = "PathOutsideVaultError";
	}
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

const SYSTEM_ASSETS_PATH = "/_system/assets/";

/**
 * Where to fetch a note asset from and whether the API key goes with the request.
 * System asset paths are served by the API itself, so they are always fetched from
 * apiUrl's origin (the server may absolutize them with a public host the client
 * does not reach the API through). Any other url keeps the same-origin key rule.
 *
 * @param apiUrl - Client's configured API URL (CLI: full graphql endpoint; plugin: base URL)
 * @param url - Asset url as received from the server, absolute or relative
 */
export function assetFetchTarget(apiUrl: string, url: string): { url: string; sendKey: boolean } {
	try {
		const parsed = new URL(url, apiUrl);
		if (parsed.pathname.startsWith(SYSTEM_ASSETS_PATH)) {
			return { url: new URL(parsed.pathname + parsed.search, apiUrl).toString(), sendKey: true };
		}
	} catch {
		// malformed url or apiUrl: fall through to the fail-closed rule below
	}
	const resolved = resolveAssetUrl(apiUrl, url);
	return { url: resolved, sendKey: sameOrigin(apiUrl, resolved) };
}

const NOTICE_ERROR_LENGTH = 200;

/**
 * The text of a Notice for a sync's errors: the first one, cut short so a
 * batch failure that names a hundred notes still fits, and how many others
 * there are. The full list goes to the console.
 */
export function syncErrorNotice(errors: string[]): string {
	const first = errors[0] ?? "";
	const shown = first.length > NOTICE_ERROR_LENGTH ? `${first.slice(0, NOTICE_ERROR_LENGTH)}…` : first;
	return errors.length > 1 ? `${shown} (+${errors.length - 1} more)` : shown;
}
