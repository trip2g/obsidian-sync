import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";

// A crash or a full disk mid-write is simulated by a write that stores half the
// bytes and then throws, whichever fs call the code under test writes through.
const crash = vi.hoisted(() => ({ armed: false }));

vi.mock("fs", async () => {
	const actual = await vi.importActual<typeof import("fs")>("fs");
	const halfThenThrow = (target: unknown, data: unknown) => {
		const text = String(data);
		const half = text.slice(0, Math.floor(text.length / 2));
		if (typeof target === "number") {
			actual.writeSync(target, half);
		} else {
			actual.writeFileSync(target as string, half);
		}
		crash.armed = false;
		throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
	};
	const writeFileSync = ((target: unknown, data: unknown, ...rest: unknown[]) => {
		if (crash.armed) {
			return halfThenThrow(target, data);
		}
		return (actual.writeFileSync as (...a: unknown[]) => void)(target, data, ...rest);
	}) as typeof actual.writeFileSync;
	const writeSync = ((fd: number, data: unknown, ...rest: unknown[]) => {
		if (crash.armed) {
			return halfThenThrow(fd, data);
		}
		return (actual.writeSync as (...a: unknown[]) => number)(fd, data, ...rest);
	}) as typeof actual.writeSync;
	return { ...actual, default: { ...actual, writeFileSync, writeSync }, writeFileSync, writeSync };
});

import * as fs from "fs";
import { NodeEnv } from "./env";

describe("a crash while the CLI writes", () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-sync-atomic-"));
	});

	afterEach(() => {
		crash.armed = false;
		fs.rmSync(dir, { recursive: true, force: true });
	});

	const makeEnv = () =>
		new NodeEnv({ folder: dir, apiUrl: "http://localhost:8081", apiKey: "k", twoWaySync: true });

	it("leaves the previous note intact, never a truncated one, and no stray file", async () => {
		fs.writeFileSync(path.join(dir, "n.md"), "the note as it was before the pull");
		const env = makeEnv();

		crash.armed = true;
		await expect(env.writeFile("n.md", "the note as the server holds it now")).rejects.toThrow("ENOSPC");

		expect(fs.readFileSync(path.join(dir, "n.md"), "utf-8")).toBe("the note as it was before the pull");
		expect(fs.readdirSync(dir)).toEqual(["n.md"]);
	});

	it("leaves the previous asset intact, never a truncated one, and no stray file", async () => {
		fs.writeFileSync(path.join(dir, "img.png"), "the asset as it was before the download");
		const env = makeEnv();
		const data = new TextEncoder().encode("the asset as the server holds it now");

		crash.armed = true;
		await expect(env.writeBinaryFile("img.png", data.buffer)).rejects.toThrow("ENOSPC");

		expect(fs.readFileSync(path.join(dir, "img.png"), "utf-8")).toBe("the asset as it was before the download");
		expect(fs.readdirSync(dir)).toEqual(["img.png"]);

		await env.writeBinaryFile("img.png", data.buffer);
		expect(fs.readFileSync(path.join(dir, "img.png"), "utf-8")).toBe("the asset as the server holds it now");
	});

	it("leaves the previous state file intact, never a truncated one", async () => {
		const stateFile = path.join(dir, ".sync-state.localhost_8081.json");
		fs.writeFileSync(stateFile, JSON.stringify({ files: { "n.md": "hash_n" } }));
		const env = makeEnv();

		crash.armed = true;
		await expect(env.saveSyncState({ files: { "n.md": "hash_n", "m.md": "hash_m" } })).rejects.toThrow("ENOSPC");

		expect(JSON.parse(fs.readFileSync(stateFile, "utf-8"))).toEqual({ files: { "n.md": "hash_n" } });
		expect(makeEnv().getSyncState().files).toEqual({ "n.md": "hash_n" });
	});

	it("still writes notes and the state normally, through a symlink and keeping the file mode", async () => {
		fs.mkdirSync(path.join(dir, "real"));
		fs.writeFileSync(path.join(dir, "real", "n.md"), "old");
		fs.chmodSync(path.join(dir, "real", "n.md"), 0o600);
		fs.symlinkSync(path.join(dir, "real", "n.md"), path.join(dir, "link.md"));
		const env = makeEnv();

		await env.writeFile("link.md", "new");
		await env.saveSyncState({ files: { "link.md": "h" } });

		expect(fs.lstatSync(path.join(dir, "link.md")).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(path.join(dir, "real", "n.md"), "utf-8")).toBe("new");
		expect(fs.statSync(path.join(dir, "real", "n.md")).mode & 0o777).toBe(0o600);
		expect(makeEnv().getSyncState().files).toEqual({ "link.md": "h" });
	});

	it("keeps the exact mode of the file it replaces, whatever the umask", async () => {
		fs.writeFileSync(path.join(dir, "n.md"), "old");
		fs.chmodSync(path.join(dir, "n.md"), 0o666);
		const env = makeEnv();

		await env.writeFile("n.md", "new");

		expect(fs.statSync(path.join(dir, "n.md")).mode & 0o777).toBe(0o666);
	});

	it("removes the temporary files of a write whose process died, and keeps those of a live one", () => {
		fs.mkdirSync(path.join(dir, "sub"));
		fs.mkdirSync(path.join(dir, ".git"));
		const dead = path.join(dir, "sub", ".n.md.999999999.a1b2c3d4e5f6.tmp");
		const live = path.join(dir, `.m.md.${process.pid}.a1b2c3d4e5f6.tmp`);
		const hidden = path.join(dir, ".git", ".x.json.999999999.a1b2c3d4e5f6.tmp");
		const lookalike = path.join(dir, ".n.md.999999999.tmp");
		for (const f of [dead, live, hidden, lookalike]) {
			fs.writeFileSync(f, "partial");
		}

		makeEnv();

		expect(fs.existsSync(dead)).toBe(false);
		expect(fs.existsSync(live)).toBe(true);
		expect(fs.existsSync(hidden)).toBe(true);
		expect(fs.existsSync(lookalike)).toBe(true);
	});
});
