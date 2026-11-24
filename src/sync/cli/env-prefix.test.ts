import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NodeEnv } from "./env";
import { classifySync } from "../classify";
import { executePlan } from "../execute";

describe("NodeEnv with a remote prefix", () => {
	let vault: string;
	let env: NodeEnv;

	const sha = (s: string) => env.computeHash(s);

	beforeEach(() => {
		vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-prefix-")));
		env = new NodeEnv({
			folder: vault,
			apiUrl: "http://localhost:1/graphql",
			apiKey: "k",
			twoWaySync: true,
			prefix: "kb",
		});
	});

	afterEach(() => {
		fs.rmSync(vault, { recursive: true, force: true });
	});

	it("maps every file operation from the server's path to the local one", async () => {
		await env.createFolder("kb/sub");
		await env.writeFile("kb/sub/a.md", "a");
		expect(fs.readFileSync(path.join(vault, "sub/a.md"), "utf-8")).toBe("a");
		expect(fs.existsSync(path.join(vault, "kb"))).toBe(false);
		expect(env.fileExistsSync("kb/sub/a.md")).toBe(true);
		expect(await env.readFileContent("kb/sub/a.md")).toBe("a");

		await env.writeBinaryFile("kb/img.png", new Uint8Array([1, 2]).buffer);
		expect(fs.existsSync(path.join(vault, "img.png"))).toBe(true);
		expect(await env.hashBinaryFile("kb/img.png")).toMatch(/^[0-9a-f]{64}$/);
		expect((await env.openBinaryBlob("kb/img.png")).size).toBe(2);
		expect(await env.resolveAssetPath("img.png", "kb/sub/a.md")).toBe("kb/img.png");

		await env.deleteFile("kb/sub/a.md");
		expect(fs.existsSync(path.join(vault, "sub/a.md"))).toBe(false);
	});

	it("still refuses a path that leaves the vault", async () => {
		await expect(env.writeFile("kb/../../escaped.md", "x")).rejects.toThrow();
		expect(env.fileExistsSync("kb/../../escaped.md")).toBe(false);
	});

	it("pulls a server note under the prefix to its local path and leaves the rest of the server alone", async () => {
		fs.writeFileSync(path.join(vault, "local.md"), "local");
		const server: Record<string, string> = {
			"kb/new.md": "from server",
			"kb/local.md": "local",
			"other/x.md": "not ours",
		};
		const hashes = await Promise.all(Object.entries(server).map(async ([p, c]) => ({ path: p, hash: await sha(c) })));
		const pushed: string[] = [];
		(env as unknown as { sdk: unknown }).sdk = {
			FetchServerHashes: () => Promise.resolve({ notePaths: hashes }),
			FetchNoteContents: ({ filter }: { filter: { paths: string[] } }) =>
				Promise.resolve({ notePaths: filter.paths.map((p) => ({ path: p, content: server[p] })) }),
			PushNotes: ({ input }: { input: { updates: { path: string }[] } }) => {
				pushed.push(...input.updates.map((u) => u.path));
				return Promise.resolve({ pushNotes: { notes: [] } });
			},
			CommitNotes: () => Promise.resolve({ commitNotes: { updated: [] } }),
		};

		const plan = await classifySync(env);
		const result = await executePlan(env, plan, { twoWaySync: true });

		expect(result.errors).toEqual([]);
		expect(fs.readFileSync(path.join(vault, "new.md"), "utf-8")).toBe("from server");
		expect(fs.existsSync(path.join(vault, "kb"))).toBe(false);
		expect(fs.existsSync(path.join(vault, "other"))).toBe(false);
		expect(pushed).toEqual([]);
		expect(Object.keys(env.getSyncState().files).sort()).toEqual(["kb/local.md", "kb/new.md"]);
	});
});
