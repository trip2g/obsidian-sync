/**
 * SSE live-pull pattern precedence resolver.
 *
 * Priority: CLI flags > data.json livePull patterns > default (["**"] for include, [] for exclude).
 */

export interface LivePullPatternOptions {
	/** Patterns from --include flags */
	flagInclude: string[];
	/** Patterns from --exclude flags */
	flagExclude: string[];
	/** livePullIncludePatterns from data.json syncDirs[0] */
	dataInclude: string[];
	/** livePullExcludePatterns from data.json syncDirs[0] */
	dataExclude: string[];
}

export interface LivePullPatterns {
	include: string[];
	exclude: string[];
}

/**
 * Resolve effective include/exclude patterns for SSE live-pull.
 *
 * Precedence for each dimension independently:
 *   1. CLI flags (--include / --exclude) — if non-empty, use exclusively
 *   2. data.json livePull patterns — if non-empty, use as fallback
 *   3. Default: include=["**"], exclude=[]
 */
export function resolveLivePullPatterns(opts: LivePullPatternOptions): LivePullPatterns {
	let include: string[];
	if (opts.flagInclude.length > 0) {
		include = opts.flagInclude;
	} else if (opts.dataInclude.length > 0) {
		include = opts.dataInclude;
	} else {
		include = ["**"];
	}

	let exclude: string[];
	if (opts.flagExclude.length > 0) {
		exclude = opts.flagExclude;
	} else if (opts.dataExclude.length > 0) {
		exclude = opts.dataExclude;
	} else {
		exclude = [];
	}

	return { include, exclude };
}
