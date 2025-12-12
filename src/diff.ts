export type DiffLineType = "unchanged" | "added" | "removed" | "modified";

export interface DiffLine {
	type: DiffLineType;
	lineNumber: number | null; // null for added/removed in opposite column
	content: string;
}

export interface DiffResult {
	left: DiffLine[];
	right: DiffLine[];
	stats: {
		added: number;
		removed: number;
		modified: number;
	};
}

/**
 * Compute a side-by-side diff between two texts
 * Uses a simple LCS-based approach for line matching
 */
export function computeSideBySideDiff(localContent: string, remoteContent: string): DiffResult {
	const localLines = localContent.split("\n");
	const remoteLines = remoteContent.split("\n");

	// Compute LCS to find matching lines
	const lcs = computeLCS(localLines, remoteLines);

	const left: DiffLine[] = [];
	const right: DiffLine[] = [];
	const stats = { added: 0, removed: 0, modified: 0 };

	let localIdx = 0;
	let remoteIdx = 0;
	let lcsIdx = 0;

	while (localIdx < localLines.length || remoteIdx < remoteLines.length) {
		const lcsMatch = lcs[lcsIdx];

		// Check if current lines match the LCS
		const localMatchesLCS = lcsMatch && localIdx === lcsMatch.localIdx;
		const remoteMatchesLCS = lcsMatch && remoteIdx === lcsMatch.remoteIdx;

		if (localMatchesLCS && remoteMatchesLCS) {
			// Both match - unchanged line
			left.push({
				type: "unchanged",
				lineNumber: localIdx + 1,
				content: localLines[localIdx],
			});
			right.push({
				type: "unchanged",
				lineNumber: remoteIdx + 1,
				content: remoteLines[remoteIdx],
			});
			localIdx++;
			remoteIdx++;
			lcsIdx++;
		} else if (!localMatchesLCS && localIdx < localLines.length && (remoteMatchesLCS || remoteIdx >= remoteLines.length)) {
			// Local line not in LCS - removed
			left.push({
				type: "removed",
				lineNumber: localIdx + 1,
				content: localLines[localIdx],
			});
			right.push({
				type: "removed",
				lineNumber: null,
				content: "",
			});
			stats.removed++;
			localIdx++;
		} else if (!remoteMatchesLCS && remoteIdx < remoteLines.length && (localMatchesLCS || localIdx >= localLines.length)) {
			// Remote line not in LCS - added
			left.push({
				type: "added",
				lineNumber: null,
				content: "",
			});
			right.push({
				type: "added",
				lineNumber: remoteIdx + 1,
				content: remoteLines[remoteIdx],
			});
			stats.added++;
			remoteIdx++;
		} else {
			// Both have non-matching lines - show as modified pair
			left.push({
				type: "modified",
				lineNumber: localIdx + 1,
				content: localLines[localIdx] ?? "",
			});
			right.push({
				type: "modified",
				lineNumber: remoteIdx + 1,
				content: remoteLines[remoteIdx] ?? "",
			});
			stats.modified++;
			localIdx++;
			remoteIdx++;
		}
	}

	return { left, right, stats };
}

interface LCSMatch {
	localIdx: number;
	remoteIdx: number;
}

/**
 * Compute Longest Common Subsequence of lines
 */
function computeLCS(local: string[], remote: string[]): LCSMatch[] {
	const m = local.length;
	const n = remote.length;

	// Build DP table
	const dp: number[][] = [];
	for (let i = 0; i <= m; i++) {
		dp[i] = new Array(n + 1).fill(0) as number[];
	}

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (local[i - 1] === remote[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	// Backtrack to find LCS
	const result: LCSMatch[] = [];
	let i = m;
	let j = n;

	while (i > 0 && j > 0) {
		if (local[i - 1] === remote[j - 1]) {
			result.unshift({ localIdx: i - 1, remoteIdx: j - 1 });
			i--;
			j--;
		} else if (dp[i - 1][j] > dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	return result;
}

/**
 * Highlight character-level differences within a line
 */
export function highlightInlineChanges(oldText: string, newText: string): { old: string; new: string } {
	// Simple character diff - find common prefix and suffix
	let prefixLen = 0;
	const minLen = Math.min(oldText.length, newText.length);

	while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
		prefixLen++;
	}

	let suffixLen = 0;
	while (
		suffixLen < minLen - prefixLen &&
		oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
	) {
		suffixLen++;
	}

	const oldChanged = oldText.slice(prefixLen, oldText.length - suffixLen);
	const newChanged = newText.slice(prefixLen, newText.length - suffixLen);

	return {
		old:
			oldText.slice(0, prefixLen) +
			(oldChanged ? `<mark class="diff-del">${escapeHtml(oldChanged)}</mark>` : "") +
			oldText.slice(oldText.length - suffixLen),
		new:
			newText.slice(0, prefixLen) +
			(newChanged ? `<mark class="diff-add">${escapeHtml(newChanged)}</mark>` : "") +
			newText.slice(newText.length - suffixLen),
	};
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
