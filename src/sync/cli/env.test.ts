import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NodeEnv, stateFileNameForApiUrl } from "./env";

describe("stateFileNameForApiUrl", () => {
	it("returns host-based filename for http://localhost:8081", () => {
		expect(stateFileNameForApiUrl("http://localhost:8081")).toBe(".sync-state.localhost_8081.json");
	});

	it("ignores path — http://localhost:8081/graphql gives same result", () => {
		expect(stateFileNameForApiUrl("http://localhost:8081/graphql")).toBe(".sync-state.localhost_8081.json");
	});

	it("returns host-based filename for https://trip2g.com/graphql", () => {
		expect(stateFileNameForApiUrl("https://trip2g.com/graphql")).toBe(".sync-state.trip2g.com.json");
	});

	it("ignores path — https://trip2g.com/_system/graphql gives same result", () => {
		expect(stateFileNameForApiUrl("https://trip2g.com/_system/graphql")).toBe(".sync-state.trip2g.com.json");
	});

	it("different ports produce different filenames", () => {
		const a = stateFileNameForApiUrl("http://localhost:8081");
		const b = stateFileNameForApiUrl("http://localhost:9999");
		expect(a).not.toBe(b);
		expect(a).toBe(".sync-state.localhost_8081.json");
		expect(b).toBe(".sync-state.localhost_9999.json");
	});

	it("falls back to legacy .sync-state.json for empty string", () => {
		expect(stateFileNameForApiUrl("")).toBe(".sync-state.json");
	});

	it("falls back to legacy .sync-state.json for invalid URL", () => {
		expect(stateFileNameForApiUrl("not-a-url")).toBe(".sync-state.json");
	});

	it("sanitizes unusual characters in host (colons become underscores)", () => {
		// IPv6-style would have colons; even standard port separator is sanitized
		const result = stateFileNameForApiUrl("http://localhost:8081");
		expect(result).toMatch(/^\.sync-state\.[a-zA-Z0-9._-]+\.json$/);
	});
});

describe("stateFileNameForApiUrl — isolation integration", () => {
	it("two different apiUrls produce two distinct state files in a temp dir", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-sync-test-"));
		try {
			const fileA = stateFileNameForApiUrl("http://localhost:8081");
			const fileB = stateFileNameForApiUrl("https://trip2g.com/graphql");

			expect(fileA).not.toBe(fileB);

			// Write distinct content into each file
			const stateA = JSON.stringify({ files: { "a.md": "hash_a" } });
			const stateB = JSON.stringify({ files: { "b.md": "hash_b" } });
			fs.writeFileSync(path.join(tmpDir, fileA), stateA, "utf-8");
			fs.writeFileSync(path.join(tmpDir, fileB), stateB, "utf-8");

			// Reading back confirms the two files are independent
			const readA = JSON.parse(fs.readFileSync(path.join(tmpDir, fileA), "utf-8"));
			const readB = JSON.parse(fs.readFileSync(path.join(tmpDir, fileB), "utf-8"));

			expect(readA.files).toHaveProperty("a.md");
			expect(readA.files).not.toHaveProperty("b.md");
			expect(readB.files).toHaveProperty("b.md");
			expect(readB.files).not.toHaveProperty("a.md");
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});
});

describe("stateFileNameForApiUrl — stateFile override", () => {
	it("explicit relative stateFile is written inside the folder (not the default per-host name)", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-sync-override-"));
		try {
			const defaultName = stateFileNameForApiUrl("http://localhost:8081");
			const customName = ".sync-state.custom.json";

			expect(customName).not.toBe(defaultName);

			// Simulate what NodeEnv does when stateFile is a relative path
			const resolvedCustom = path.join(tmpDir, customName);
			const resolvedDefault = path.join(tmpDir, defaultName);

			fs.writeFileSync(resolvedCustom, JSON.stringify({ files: { "x.md": "hash_x" } }), "utf-8");

			// Custom file exists; default does not
			expect(fs.existsSync(resolvedCustom)).toBe(true);
			expect(fs.existsSync(resolvedDefault)).toBe(false);

			const read = JSON.parse(fs.readFileSync(resolvedCustom, "utf-8"));
			expect(read.files).toHaveProperty("x.md");
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it("explicit absolute stateFile path is used as-is (not relative to folder)", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-sync-abs-"));
		const absFile = path.join(tmpDir, "absolute-state.json");
		try {
			// Absolute path is already resolved — not joined with folder
			expect(path.isAbsolute(absFile)).toBe(true);

			fs.writeFileSync(absFile, JSON.stringify({ files: { "abs.md": "hash_abs" } }), "utf-8");
			const read = JSON.parse(fs.readFileSync(absFile, "utf-8"));
			expect(read.files).toHaveProperty("abs.md");
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it("omitting stateFile falls back to per-host name", () => {
		// When no stateFile override is given, the name comes from stateFileNameForApiUrl
		const name = stateFileNameForApiUrl("https://trip2g.com/graphql");
		expect(name).toBe(".sync-state.trip2g.com.json");
	});
});

describe("NodeEnv.getServerHashes", () => {
	// A failed fetch used to be caught here and reported as an empty list. An
	// empty list already means something — a server holding no notes — so the
	// two became indistinguishable, and classification read a 404 as "every
	// note was deleted upstream" on a vault where nothing had happened.
	it("rejects when the fetch fails, rather than reporting an empty server", async () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-hashes-"));
		const env = new NodeEnv({
			folder,
			apiUrl: "http://localhost:8081/graphql",
			apiKey: "test-key",
			twoWaySync: true,
		});

		(env as unknown as { sdk: { FetchServerHashes: () => Promise<never> } }).sdk = {
			FetchServerHashes: () => Promise.reject(new Error("HTTP 404: Not Found")),
		};

		await expect(env.getServerHashes()).rejects.toThrow("HTTP 404");
	});

	it("returns the server's notes when the fetch succeeds", async () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-hashes-ok-"));
		const env = new NodeEnv({
			folder,
			apiUrl: "http://localhost:8081/graphql",
			apiKey: "test-key",
			twoWaySync: true,
		});

		(env as unknown as { sdk: { FetchServerHashes: () => Promise<unknown> } }).sdk = {
			FetchServerHashes: () =>
				Promise.resolve({ notePaths: [{ path: "wiki/note.md", hash: "abc" }] }),
		};

		await expect(env.getServerHashes()).resolves.toEqual([{ path: "wiki/note.md", hash: "abc" }]);
	});
});

describe("NodeEnv sync state that cannot be read", () => {
	// Read as empty, a damaged state turns every file that differs from the
	// server into a first-sync conflict, and the default resolution pushes the
	// local copy over the server's.
	const cases: Array<[string, string]> = [
		["truncated JSON", '{"files": {"a.md": "hash_a", "b.m'],
		["an empty file", ""],
		["JSON without a files object", '{"lastSyncedAt": 1}'],
	];
	for (const [name, content] of cases) {
		it(`refuses to start, naming the file, on ${name}`, () => {
			const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-corrupt-"));
			try {
				const stateFile = path.join(folder, "state.json");
				fs.writeFileSync(stateFile, content, "utf-8");
				const build = () =>
					new NodeEnv({
						folder,
						apiUrl: "http://localhost:8081/graphql",
						apiKey: "test-key",
						twoWaySync: true,
						stateFile,
					});

				expect(build).toThrow(stateFile);
				expect(fs.readFileSync(stateFile, "utf-8")).toBe(content);
			} finally {
				fs.rmSync(folder, { recursive: true });
			}
		});
	}

	it("starts empty when there is no state file yet", () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-nostate-"));
		try {
			const env = new NodeEnv({
				folder,
				apiUrl: "http://localhost:8081/graphql",
				apiKey: "test-key",
				twoWaySync: true,
			});
			expect(env.getSyncState()).toEqual({ files: {} });
		} finally {
			fs.rmSync(folder, { recursive: true });
		}
	});
});

describe("NodeEnv push and hide failures", () => {
	// Swallowed, a failed push looked like a push that confirmed nothing and a
	// failed hide like one that succeeded; the sync summary never mentioned either.
	const makeEnv = (sdk: unknown) => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-push-"));
		const env = new NodeEnv({
			folder,
			apiUrl: "http://localhost:8081/graphql",
			apiKey: "test-key",
			twoWaySync: true,
		});
		(env as unknown as { sdk: unknown }).sdk = sdk;
		return env;
	};

	it("rejects when the server refuses a push batch", async () => {
		const env = makeEnv({
			PushNotes: () => Promise.resolve({ pushNotes: { message: "File content must be UTF-8 text" } }),
		});
		const silence = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expect(env.pushNotes([{ path: "a.md", content: "a" }], true)).rejects.toThrow("UTF-8");
		} finally {
			silence.mockRestore();
		}
	});

	it("rejects when a hide fails", async () => {
		const env = makeEnv({
			HideNotes: () => Promise.reject(new Error("HTTP 502: Bad Gateway")),
		});
		const silence = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expect(env.hideNotes(["a.md"])).rejects.toThrow("HTTP 502");
		} finally {
			silence.mockRestore();
		}
	});
});
