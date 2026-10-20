import type { FileClassification } from "./types";

/**
 * Last-synced hashes to record when the user picks "Trust server for all".
 * A one-way folder pulls nothing, so a server-only file must stay unrecorded:
 * recording it would classify it as locally deleted next time and hide it.
 */
export function trustServerBase(classifications: FileClassification[], twoWaySync: boolean): Record<string, string> {
	const base: Record<string, string> = {};
	for (const c of classifications) {
		if (c.remoteHash && (twoWaySync || c.localHash)) {
			base[c.path] = c.remoteHash;
		}
	}
	return base;
}
