/**
 * The plugin id moved from `trip2g` to `ttgsync`. BRAT installs the new id into
 * a second folder, so an old copy may still be enabled next to this one; two
 * copies syncing the same vault would race each other. Obsidian's public API
 * does not expose other plugins, so the check reads community-plugins.json.
 */

export const LEGACY_PLUGIN_ID = "trip2g";

/** Whether community-plugins.json (its text, or null if absent) enables the old id. */
export function legacyPluginEnabled(communityPluginsJson: string | null): boolean {
	if (!communityPluginsJson) return false;
	try {
		const ids: unknown = JSON.parse(communityPluginsJson);
		return Array.isArray(ids) && ids.includes(LEGACY_PLUGIN_ID);
	} catch {
		return false;
	}
}

/** The old plugin's data.json as a settings object, or null if unusable. */
export function parseLegacyData(text: string | null): Record<string, unknown> | null {
	if (!text) return null;
	try {
		const data: unknown = JSON.parse(text);
		if (data && typeof data === "object" && !Array.isArray(data)) {
			return data as Record<string, unknown>;
		}
	} catch {
		// unreadable: start from defaults
	}
	return null;
}

export type SyncTrigger = "manual" | "background";

export class LegacyPluginGuard {
	private cached: { blocked: boolean; at: number } | null = null;
	private notified = false;

	constructor(
		private opts: {
			selfId: string;
			read: () => Promise<string | null>;
			now?: () => number;
			ttlMs?: number;
		}
	) {}

	/** Whether the old copy is enabled, re-read at most once per ttl. */
	async isBlocked(): Promise<boolean> {
		if (this.opts.selfId === LEGACY_PLUGIN_ID) return false;
		const now = (this.opts.now ?? Date.now)();
		const ttl = this.opts.ttlMs ?? 3000;
		if (this.cached && now - this.cached.at < ttl) return this.cached.blocked;

		let blocked = false;
		try {
			blocked = legacyPluginEnabled(await this.opts.read());
		} catch {
			blocked = false;
		}
		this.cached = { blocked, at: now };
		return blocked;
	}

	/** A manual sync always explains itself; background syncs only until the first notice. */
	shouldNotify(trigger: SyncTrigger): boolean {
		if (trigger === "background" && this.notified) return false;
		this.notified = true;
		return true;
	}
}
