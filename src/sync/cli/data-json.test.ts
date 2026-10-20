import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findDataJsonPath, validateServerUrl, setApiUrl, runUpdateApiUrl } from "./data-json";

const NEW = path.join("/vault", ".obsidian", "plugins", "ttgsync", "data.json");
const OLD = path.join("/vault", ".obsidian", "plugins", "trip2g", "data.json");

describe("findDataJsonPath", () => {
	it("prefers the ttgsync folder", () => {
		expect(findDataJsonPath("/vault", () => true)).toBe(NEW);
	});

	it("falls back to the old trip2g folder", () => {
		expect(findDataJsonPath("/vault", (p) => p === OLD)).toBe(OLD);
	});

	it("returns null when neither exists", () => {
		expect(findDataJsonPath("/vault", () => false)).toBeNull();
	});
});

describe("validateServerUrl", () => {
	it.each(["http://127.0.0.1:8080", "https://example.com", "https://example.com/base"])("accepts %s", (url) => {
		expect(validateServerUrl(url)).toBeNull();
	});

	it.each([
		["", "required"],
		["example.com", "http or https"],
		["ftp://example.com", "http or https"],
		["http://127.0.0.1:8080/", "trailing slash"],
		["http://127.0.0.1:8080/_system/graphql", "/_system/graphql"],
		["http://example.com?x=1", "query"],
	])("rejects %j", (url, reason) => {
		expect(validateServerUrl(url)).toContain(reason);
	});
});

describe("setApiUrl", () => {
	it("rewrites apiUrl on every syncDir and keeps apiKey", () => {
		const data = {
			autoSyncOnSave: true,
			syncDirs: [
				{ path: "a", apiUrl: "https://old", apiKey: "k1" },
				{ path: "b", apiUrl: "http://127.0.0.1:8080", apiKey: "k2" },
			],
		};
		const res = setApiUrl(data, "http://127.0.0.1:8080");
		expect(res.changed).toBe(1);
		expect(res.total).toBe(2);
		expect(res.data).toEqual({
			autoSyncOnSave: true,
			syncDirs: [
				{ path: "a", apiUrl: "http://127.0.0.1:8080", apiKey: "k1" },
				{ path: "b", apiUrl: "http://127.0.0.1:8080", apiKey: "k2" },
			],
		});
		// The input is left untouched.
		expect(data.syncDirs[0].apiUrl).toBe("https://old");
	});

	it("reports zero changes when every entry already matches", () => {
		const res = setApiUrl({ syncDirs: [{ apiUrl: "https://x" }] }, "https://x");
		expect(res.changed).toBe(0);
	});

	it("handles a missing syncDirs array", () => {
		expect(setApiUrl({}, "https://x")).toMatchObject({ changed: 0, total: 0 });
	});
});

describe("runUpdateApiUrl", () => {
	let vault: string;

	beforeEach(() => {
		vault = fs.mkdtempSync(path.join(os.tmpdir(), "update-api-url-"));
	});

	afterEach(() => {
		fs.rmSync(vault, { recursive: true, force: true });
	});

	function writeData(id: string, data: unknown): string {
		const dir = path.join(vault, ".obsidian", "plugins", id);
		fs.mkdirSync(dir, { recursive: true });
		const file = path.join(dir, "data.json");
		fs.writeFileSync(file, JSON.stringify(data, null, 2));
		return file;
	}

	const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

	it("updates the old trip2g data.json", () => {
		const file = writeData("trip2g", { syncDirs: [{ apiUrl: "https://old", apiKey: "secret" }] });
		const res = runUpdateApiUrl({ cwd: vault, url: "http://127.0.0.1:8080" });
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("1 of 1");
		expect(res.stdout).toContain(file);
		expect(read(file).syncDirs[0]).toEqual({ apiUrl: "http://127.0.0.1:8080", apiKey: "secret" });
	});

	it("writes only the ttgsync copy when both exist", () => {
		const newFile = writeData("ttgsync", { syncDirs: [{ apiUrl: "https://a" }] });
		const oldFile = writeData("trip2g", { syncDirs: [{ apiUrl: "https://b" }] });
		const res = runUpdateApiUrl({ cwd: vault, url: "https://c" });
		expect(res.exitCode).toBe(0);
		expect(read(newFile).syncDirs[0].apiUrl).toBe("https://c");
		expect(read(oldFile).syncDirs[0].apiUrl).toBe("https://b");
	});

	it("leaves the file alone and exits 0 when nothing changes", () => {
		const file = writeData("ttgsync", { syncDirs: [{ apiUrl: "https://a" }] });
		const before = fs.statSync(file).mtimeMs;
		const res = runUpdateApiUrl({ cwd: vault, url: "https://a" });
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("already");
		expect(fs.statSync(file).mtimeMs).toBe(before);
	});

	it("fails without a data.json", () => {
		const res = runUpdateApiUrl({ cwd: vault, url: "https://a" });
		expect(res.exitCode).not.toBe(0);
		expect(res.stderr).toContain("no data.json");
	});

	it("fails on an invalid url without touching the file", () => {
		const file = writeData("ttgsync", { syncDirs: [{ apiUrl: "https://a" }] });
		const res = runUpdateApiUrl({ cwd: vault, url: "https://b/" });
		expect(res.exitCode).not.toBe(0);
		expect(res.stderr).toContain("trailing slash");
		expect(read(file).syncDirs[0].apiUrl).toBe("https://a");
	});

	it("fails on a data.json that is not JSON", () => {
		const dir = path.join(vault, ".obsidian", "plugins", "ttgsync");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "data.json"), "{oops");
		const res = runUpdateApiUrl({ cwd: vault, url: "https://a" });
		expect(res.exitCode).not.toBe(0);
		expect(res.stderr).toContain("data.json");
	});
});
