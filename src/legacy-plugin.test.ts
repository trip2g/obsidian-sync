import { describe, it, expect } from "vitest";
import { legacyPluginEnabled, parseLegacyData, LegacyPluginGuard } from "./legacy-plugin";

describe("legacyPluginEnabled", () => {
	it("is true when community-plugins.json lists trip2g", () => {
		expect(legacyPluginEnabled('["dataview","trip2g","ttgsync"]')).toBe(true);
	});

	it("is false when only ttgsync is listed", () => {
		expect(legacyPluginEnabled('["ttgsync"]')).toBe(false);
	});

	it("is false for a missing or broken file", () => {
		expect(legacyPluginEnabled(null)).toBe(false);
		expect(legacyPluginEnabled("{oops")).toBe(false);
		expect(legacyPluginEnabled('{"trip2g":true}')).toBe(false);
	});
});

describe("parseLegacyData", () => {
	it("returns the settings object", () => {
		expect(parseLegacyData('{"syncDirs":[{"apiKey":"k"}]}')).toEqual({ syncDirs: [{ apiKey: "k" }] });
	});

	it("returns null for anything that is not an object", () => {
		expect(parseLegacyData(null)).toBeNull();
		expect(parseLegacyData("{oops")).toBeNull();
		expect(parseLegacyData("null")).toBeNull();
		expect(parseLegacyData("[1]")).toBeNull();
	});
});

describe("LegacyPluginGuard", () => {
	function setup(file: string | null, selfId = "ttgsync") {
		const state = { file, reads: 0, now: 0 };
		const guard = new LegacyPluginGuard({
			selfId,
			read: async () => {
				state.reads++;
				return state.file;
			},
			now: () => state.now,
			ttlMs: 5000,
		});
		return { state, guard };
	}

	it("blocks while the old id is enabled", async () => {
		const { guard } = setup('["trip2g"]');
		expect(await guard.isBlocked()).toBe(true);
	});

	it("does not block itself when it still runs under the old id", async () => {
		const { guard, state } = setup('["trip2g"]', "trip2g");
		expect(await guard.isBlocked()).toBe(false);
		expect(state.reads).toBe(0);
	});

	it("caches the answer for the ttl, then reads again", async () => {
		const { guard, state } = setup('["trip2g"]');
		await guard.isBlocked();
		state.file = '["ttgsync"]';
		state.now = 4999;
		expect(await guard.isBlocked()).toBe(true);
		expect(state.reads).toBe(1);
		state.now = 5000;
		expect(await guard.isBlocked()).toBe(false);
		expect(state.reads).toBe(2);
	});

	it("treats a failed read as not blocked", async () => {
		const guard = new LegacyPluginGuard({
			selfId: "ttgsync",
			read: async () => {
				throw new Error("EACCES");
			},
		});
		expect(await guard.isBlocked()).toBe(false);
	});

	it("notifies a manual sync every time, background syncs once", () => {
		const { guard } = setup(null);
		expect(guard.shouldNotify("background")).toBe(true);
		expect(guard.shouldNotify("background")).toBe(false);
		expect(guard.shouldNotify("manual")).toBe(true);
		expect(guard.shouldNotify("manual")).toBe(true);
	});

	it("background syncs stay quiet after a manual notice", () => {
		const { guard } = setup(null);
		expect(guard.shouldNotify("manual")).toBe(true);
		expect(guard.shouldNotify("background")).toBe(false);
	});
});
