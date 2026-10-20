import { describe, it, expect } from "vitest";
import { splitLegacySyncState } from "./legacy-sync-state";

const a = { files: { "a.md": "h1" } };
const b = { files: { "b.md": "h2" }, lastSyncedAt: 5 };

describe("splitLegacySyncState", () => {
	it("adopts only the entries for this vault's servers", () => {
		const raw = JSON.stringify({ "https://a": a, "https://b": b });
		expect(splitLegacySyncState(raw, ["https://a"])).toEqual({
			adopted: { "https://a": a },
			remainder: { "https://b": b },
		});
	});

	it("leaves an empty remainder when every entry is adopted", () => {
		const raw = JSON.stringify({ "https://a": a });
		expect(splitLegacySyncState(raw, ["https://a", "https://c"])).toEqual({
			adopted: { "https://a": a },
			remainder: {},
		});
	});

	it("adopts nothing when no server matches", () => {
		const raw = JSON.stringify({ "https://b": b });
		expect(splitLegacySyncState(raw, ["https://a"])).toEqual({
			adopted: {},
			remainder: { "https://b": b },
		});
	});

	it.each([
		["malformed JSON", "{not json"],
		["null", "null"],
		["an array", "[]"],
		["a non-object entry", JSON.stringify({ "https://a": 1 })],
		["an entry without files", JSON.stringify({ "https://a": { lastSyncedAt: 1 } })],
		["files that is not an object", JSON.stringify({ "https://a": { files: [] } })],
	])("returns null for %s", (_name, raw) => {
		expect(splitLegacySyncState(raw, ["https://a"])).toBeNull();
	});
});
