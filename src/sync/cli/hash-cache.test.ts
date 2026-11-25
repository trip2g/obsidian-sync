import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NodeEnv } from "./env";
import { classifySync } from "../classify";
import { executePlan } from "../execute";
import type { SyncState } from "../types";

// A run that finds nothing changed must not read the notes again: the state
// file keeps each note's mtime, size and hash, and the next run trusts them.
describe("NodeEnv hash cache across runs", () => {
	let vault: string;
	let serverHashes: Array<{ path: string; hash: string }>;

	const newEnv = (): NodeEnv => {
		const env = new NodeEnv({
			folder: vault,
			apiUrl: "http://localhost:1/graphql",
			apiKey: "k",
			twoWaySync: false,
		});
		(env as unknown as { sdk: unknown }).sdk = {
			FetchServerHashes: async () => ({ notePaths: serverHashes }),
			PushNotes: async () => ({ pushNotes: { notes: [], updated: [] } }),
			CommitNotes: async () => ({ commitNotes: { updated: [] } }),
		};
		return env;
	};

	const run = async (env: NodeEnv) => {
		const plan = await classifySync(env);
		await executePlan(env, plan);
		return plan;
	};

	const write = (name: string, content: string, mtimeSec: number) => {
		const file = path.join(vault, name);
		fs.writeFileSync(file, content);
		fs.utimesSync(file, mtimeSec, mtimeSec);
	};

	const statePath = () => path.join(vault, ".sync-state.localhost_1.json");

	beforeEach(async () => {
		vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sync-hash-cache-")));
		write("a.md", "alpha", 1000);
		write("b.md", "bravo", 1000);
		write("c.md", "charlie", 1000);
		const hasher = newEnv();
		serverHashes = await Promise.all(
			["a.md", "b.md", "c.md"].map(async (p) => ({
				path: p,
				hash: await hasher.computeHash(fs.readFileSync(path.join(vault, p), "utf-8")),
			}))
		);
	});

	afterEach(() => {
		fs.rmSync(vault, { recursive: true, force: true });
	});

	it("reads no note on a second run over an unchanged vault", async () => {
		await run(newEnv());

		const env = newEnv();
		const read = vi.spyOn(env, "readFileContent");
		const plan = await run(env);

		expect(read).not.toHaveBeenCalled();
		expect(plan.unchanged).toBe(3);
	});

	it("re-reads only the note whose content changed", async () => {
		await run(newEnv());
		write("b.md", "BRAVO!", 2000);

		const env = newEnv();
		const read = vi.spyOn(env, "readFileContent");
		const plan = await classifySync(env);

		expect(read.mock.calls.map((c) => c[0])).toEqual(["b.md"]);
		expect(plan.pushes.map((c) => c.path)).toEqual(["b.md"]);
	});

	it("re-reads a note that was only touched", async () => {
		await run(newEnv());
		fs.utimesSync(path.join(vault, "c.md"), 3000, 3000);

		const env = newEnv();
		const read = vi.spyOn(env, "readFileContent");
		const plan = await classifySync(env);

		expect(read.mock.calls.map((c) => c[0])).toEqual(["c.md"]);
		expect(plan.unchanged).toBe(3);
	});

	it("re-reads a note whose size changed under the same mtime", async () => {
		await run(newEnv());
		write("a.md", "alpha and more", 1000);

		const env = newEnv();
		const read = vi.spyOn(env, "readFileContent");
		const plan = await classifySync(env);

		expect(read.mock.calls.map((c) => c[0])).toEqual(["a.md"]);
		expect(plan.pushes.map((c) => c.path)).toEqual(["a.md"]);
	});

	it("writes the cache to the state file and drops notes that are gone", async () => {
		await run(newEnv());
		fs.rmSync(path.join(vault, "c.md"));
		serverHashes = serverHashes.filter((h) => h.path !== "c.md");
		await run(newEnv());

		const saved = JSON.parse(fs.readFileSync(statePath(), "utf-8")) as Required<SyncState>;
		expect(Object.keys(saved.localHashes).sort()).toEqual(["a.md", "b.md"]);
		expect(saved.localHashes["a.md"]).toBe(serverHashes[0].hash);
		expect(saved.mtimes["a.md"]).toBe(1000 * 1000);
		expect(saved.sizes["a.md"]).toBe("alpha".length);
	});

	it("loads a state file written without the cache and reads every note once", async () => {
		fs.writeFileSync(
			statePath(),
			JSON.stringify({ files: Object.fromEntries(serverHashes.map((h) => [h.path, h.hash])), lastSyncedAt: 1 })
		);

		const env = newEnv();
		const read = vi.spyOn(env, "readFileContent");
		const plan = await run(env);

		expect(read).toHaveBeenCalledTimes(3);
		expect(plan.unchanged).toBe(3);

		const next = newEnv();
		const nextRead = vi.spyOn(next, "readFileContent");
		await run(next);
		expect(nextRead).not.toHaveBeenCalled();
	});
});
