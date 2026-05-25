/**
 * Build a predicate that tests whether a sync path matches any exclude pattern.
 *
 * Patterns are matched against sync paths (relative to the sync folder, including
 * any prefix). Semantics:
 * - A plain name like `dev` matches the path `dev` and everything under `dev/`.
 *   Matching is anchored at the path root, so `dev` does NOT match `a/dev/x`.
 * - Glob metacharacters are supported: `*` matches within a single segment,
 *   `**` matches across segments, `?` matches a single non-slash character.
 *
 * An empty / whitespace-only pattern is ignored. With no usable patterns the
 * predicate always returns false (nothing excluded).
 */
export function makeExcludeMatcher(patterns: string[]): (path: string) => boolean {
	const normalized = patterns
		.map((p) => p.trim().replace(/\/+$/, ""))
		.filter((p) => p.length > 0);

	if (normalized.length === 0) {
		return () => false;
	}

	const regexes = normalized.map(patternToRegex);
	return (path: string) => regexes.some((re) => re.test(path));
}

function patternToRegex(pattern: string): RegExp {
	if (/[*?]/.test(pattern)) {
		return new RegExp("^" + globToRegexSource(pattern) + "$");
	}
	// Plain name: match the directory/file itself or anything beneath it.
	return new RegExp("^" + escapeRegex(pattern) + "(?:/.*)?$");
}

function globToRegexSource(pattern: string): string {
	let out = "";
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		if (ch === "*") {
			if (pattern[i + 1] === "*") {
				out += ".*";
				i++;
			} else {
				out += "[^/]*";
			}
		} else if (ch === "?") {
			out += "[^/]";
		} else {
			out += escapeRegex(ch);
		}
	}
	return out;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
