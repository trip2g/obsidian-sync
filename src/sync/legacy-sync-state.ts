import type { SyncState } from "./types";

export interface LegacySyncStateSplit {
	/** Entries for this vault's servers, to move into vault storage. */
	adopted: Record<string, SyncState>;
	/** Entries for other vaults' servers, to leave in the legacy key. */
	remainder: Record<string, SyncState>;
}

/**
 * Split the legacy global sync-state blob (apiUrl -> SyncState, shared by every
 * vault on the device) into the entries this vault owns and the rest.
 * Returns null when the blob is malformed, so the caller leaves it untouched.
 */
export function splitLegacySyncState(raw: string, apiUrls: string[]): LegacySyncStateSplit | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isObject(parsed) || Array.isArray(parsed)) return null;

	const own = new Set(apiUrls);
	const split: LegacySyncStateSplit = { adopted: {}, remainder: {} };
	for (const [key, value] of Object.entries(parsed)) {
		if (!isObject(value) || !isObject(value.files) || Array.isArray(value.files)) return null;
		const state = value as unknown as SyncState;
		if (own.has(key)) {
			split.adopted[key] = state;
		} else {
			split.remainder[key] = state;
		}
	}
	return split;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
