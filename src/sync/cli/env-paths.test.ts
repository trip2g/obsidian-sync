import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NodeEnv } from "./env";

describe("NodeEnv keeps every file operation inside the vault", () => {
	let root: string;
	let vault: string;
	let env: NodeEnv;

	beforeEach(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-paths-")));
		vault = path.join(root, "vault");
		fs.mkdirSync(path.join(vault, ".obsidian/plugins/trip2g"), { recursive: true });
		fs.mkdirSync(path.join(vault, "img"));
		fs.mkdirSync(path.join(root, "outside"));
		fs.writeFileSync(path.join(root, "secret.txt"), "outside secret");
		fs.writeFileSync(path.join(root, "outside/secret.txt"), "outside secret");
		fs.writeFileSync(path.join(vault, ".obsidian/plugins/trip2g/data.json"), '{"apiKey":"k"}');
		fs.writeFileSync(path.join(vault, "img/a.png"), "png");
		env = new NodeEnv({ folder: vault, apiUrl: "http://localhost:1/graphql", apiKey: "k", twoWaySync: true });
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("does not resolve asset references that leave the vault or point into a dot folder", async () => {
		expect(await env.resolveAssetPath("../secret.txt", "a.md")).toBeNull();
		expect(await env.resolveAssetPath("./../secret.txt", "a.md")).toBeNull();
		expect(await env.resolveAssetPath(".obsidian/plugins/trip2g/data.json", "a.md")).toBeNull();
		expect(await env.resolveAssetPath("data.json", ".obsidian/plugins/trip2g/n.md")).toBeNull();
		expect(await env.resolveAssetPath("img/a.png", "a.md")).toBe("img/a.png");
	});

	it("does not resolve a reference that goes through a symlink leaving the vault", async () => {
		fs.symlinkSync(path.join(root, "outside"), path.join(vault, "link"));
		expect(await env.resolveAssetPath("link/secret.txt", "a.md")).toBeNull();
		expect(env.fileExistsSync("link/secret.txt")).toBe(false);
	});

	it("does not resolve a reference to a file symlink leaving the vault", async () => {
		fs.symlinkSync(path.join(root, "secret.txt"), path.join(vault, "img/s.png"));
		expect(await env.resolveAssetPath("img/s.png", "a.md")).toBeNull();
		await expect(env.hashBinaryFile("img/s.png")).rejects.toThrow();
		await expect(env.openBinaryBlob("img/s.png")).rejects.toThrow();
	});

	it("refuses to read outside the vault", async () => {
		await expect(env.hashBinaryFile("../secret.txt")).rejects.toThrow();
		await expect(env.openBinaryBlob("../secret.txt")).rejects.toThrow();
		await expect(env.readFileContent("../secret.txt")).rejects.toThrow();
		await expect(env.hashBinaryFile(path.join(root, "secret.txt"))).rejects.toThrow();
		await expect(env.openBinaryBlob(path.join(root, "secret.txt"))).rejects.toThrow();
		expect(env.fileExistsSync("../secret.txt")).toBe(false);
	});

	it("refuses to write, create or delete outside the vault", async () => {
		await expect(env.writeFile("../escaped.md", "x")).rejects.toThrow();
		await expect(env.writeBinaryFile("../escaped.bin", new ArrayBuffer(1))).rejects.toThrow();
		await expect(env.createFolder("../newdir")).rejects.toThrow();
		await expect(env.writeFile(path.join(root, "abs.md"), "x")).rejects.toThrow();
		await expect(env.deleteFile("../secret.txt")).rejects.toThrow();

		expect(fs.existsSync(path.join(root, "escaped.md"))).toBe(false);
		expect(fs.existsSync(path.join(root, "escaped.bin"))).toBe(false);
		expect(fs.existsSync(path.join(root, "newdir"))).toBe(false);
		expect(fs.existsSync(path.join(root, "abs.md"))).toBe(false);
		expect(fs.readFileSync(path.join(root, "secret.txt"), "utf-8")).toBe("outside secret");
	});

	it("refuses to write or create through a symlink leaving the vault", async () => {
		fs.symlinkSync(path.join(root, "outside"), path.join(vault, "link"));

		await expect(env.writeFile("link/escaped.md", "x")).rejects.toThrow();
		await expect(env.createFolder("link/sub")).rejects.toThrow();
		await expect(env.deleteFile("link/secret.txt")).rejects.toThrow();

		expect(fs.existsSync(path.join(root, "outside/escaped.md"))).toBe(false);
		expect(fs.existsSync(path.join(root, "outside/sub"))).toBe(false);
		expect(fs.existsSync(path.join(root, "outside/secret.txt"))).toBe(true);
	});

	it("still reads and writes ordinary vault paths", async () => {
		await env.createFolder("notes/deep");
		await env.writeFile("notes/deep/n.md", "hello");
		expect(await env.readFileContent("notes/deep/n.md")).toBe("hello");
		await env.writeBinaryFile("img/b.png", new TextEncoder().encode("bin").buffer as ArrayBuffer);
		expect(env.fileExistsSync("img/b.png")).toBe(true);
		await env.deleteFile("img/b.png");
		expect(env.fileExistsSync("img/b.png")).toBe(false);
	});

	it("answers false instead of throwing for paths the filesystem cannot walk", () => {
		fs.writeFileSync(path.join(vault, "a.md"), "x");
		fs.symlinkSync("loop-b", path.join(vault, "loop-a"));
		fs.symlinkSync("loop-a", path.join(vault, "loop-b"));
		expect(env.fileExistsSync("a.md/x.png")).toBe(false);
		expect(env.fileExistsSync("loop-a/x.png")).toBe(false);
		expect(env.fileExistsSync("loop-a")).toBe(false);
		expect(env.fileExistsSync(`${"n".repeat(300)}/x.png`)).toBe(false);
	});

	it("refuses a symlink that resolves into a service folder", async () => {
		fs.symlinkSync(path.join(vault, ".obsidian"), path.join(vault, "cfg"));
		expect(env.fileExistsSync("cfg/plugins/trip2g/data.json")).toBe(false);
		await expect(env.hashBinaryFile("cfg/plugins/trip2g/data.json")).rejects.toThrow();
		await expect(env.readFileContent("cfg/plugins/trip2g/data.json")).rejects.toThrow();
		await expect(env.writeBinaryFile("cfg/plugins/trip2g/data.json", new ArrayBuffer(1))).rejects.toThrow();
		expect(fs.readFileSync(path.join(vault, ".obsidian/plugins/trip2g/data.json"), "utf-8")).toBe('{"apiKey":"k"}');
	});

	it("resolves and writes assets in ordinary dot folders", async () => {
		fs.mkdirSync(path.join(vault, ".attachments"));
		fs.writeFileSync(path.join(vault, ".attachments/a.png"), "png");
		expect(env.fileExistsSync(".attachments/a.png")).toBe(true);
		await env.createFolder(".gitbook/assets");
		await env.writeBinaryFile(".gitbook/assets/b.png", new ArrayBuffer(1));
		expect(fs.existsSync(path.join(vault, ".gitbook/assets/b.png"))).toBe(true);
	});

	it("lists notes in subfolders with slash-separated paths", async () => {
		fs.mkdirSync(path.join(vault, "sub"));
		fs.writeFileSync(path.join(vault, "sub/a.md"), "x");
		const { notes, all } = (env as unknown as { walkVault(): { notes: { path: string }[]; all: string[] } }).walkVault();
		expect(notes.map((n) => n.path)).toContain("sub/a.md");
		expect(all).toContain("sub/a.md");
	});
});
