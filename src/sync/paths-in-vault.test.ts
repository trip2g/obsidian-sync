import { describe, it, expect, vi } from "vitest";
import { resolveAssetPath, type ResolveEnv } from "./resolve";
import { executePulls, downloadAssetsForNotes, executePlan } from "./execute";
import { PathOutsideVaultError } from "./utils";
import type { SyncEnv, SyncState } from "./types";

function createResolveEnv(existingFiles: string[]): ResolveEnv {
	const fileSet = new Set(existingFiles);
	return {
		fileExistsSync: (p: string) => fileSet.has(p),
		listVaultFiles: () => existingFiles,
	};
}

describe("resolveAssetPath keeps references inside the vault", () => {
	const files = ["../secret.txt", "../../secret.txt", "secret.txt", ".obsidian/plugins/trip2g/data.json", ".git/config", "img/a.png"];

	it.each([
		["../secret.txt", "a.md"],
		["./../secret.txt", "a.md"],
		["/../secret.txt", "a.md"],
		["img/../../secret.txt", "a.md"],
		["../../secret.txt", "deep/er/a.md"],
		[".obsidian/plugins/trip2g/data.json", "a.md"],
		["./.obsidian/plugins/trip2g/data.json", "a.md"],
		["/.obsidian/plugins/trip2g/data.json", "a.md"],
		[".git/config", "a.md"],
		["data.json", ".obsidian/plugins/trip2g/note.md"],
	])("does not resolve %s from %s", (ref, notePath) => {
		const env = createResolveEnv([...files, ".obsidian/plugins/trip2g/data.json"]);
		expect(resolveAssetPath(env, ref, notePath)).toBeNull();
	});

	it("still resolves an ordinary asset in a subfolder", () => {
		expect(resolveAssetPath(createResolveEnv(files), "img/a.png", "a.md")).toBe("img/a.png");
	});
});

function pullEnv(content: Record<string, string>): SyncEnv {
	return {
		pushBatchSize: 100,
		getLocalFiles: vi.fn().mockResolvedValue([]),
		getServerHashes: vi.fn().mockResolvedValue([]),
		getSyncState: vi.fn().mockReturnValue({ files: {} }),
		computeHash: vi.fn().mockImplementation(async (c: string) => `hash:${c}`),
		readFileContent: vi.fn().mockResolvedValue(""),
		writeFile: vi.fn().mockResolvedValue(undefined),
		writeBinaryFile: vi.fn().mockResolvedValue(undefined),
		readBinaryFile: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
		deleteFile: vi.fn().mockResolvedValue(undefined),
		createFolder: vi.fn().mockResolvedValue(undefined),
		fileExists: vi.fn().mockResolvedValue(false),
		fetchNoteContents: vi.fn().mockImplementation(async (paths: string[]) =>
			paths.map((p) => ({ path: p, content: content[p] ?? "x" }))
		),
		fetchNoteAssets: vi.fn().mockResolvedValue([]),
		downloadAsset: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
		onProgress: vi.fn(),
	} as unknown as SyncEnv;
}

describe("executePulls keeps server paths inside the vault", () => {
	it.each(["../x.md", "a/../../x.md", "/../x.md", "..", "a\0b.md", "/etc/x.md", "C:/x.md", "a\\..\\..\\x.md"])(
		"does not write %j",
		async (badPath) => {
			const env = pullEnv({});
			const state: SyncState = { files: {} };
			const result = await executePulls(env, [{ path: badPath, remoteHash: "h" }] as never, state);

			expect(env.writeFile).not.toHaveBeenCalled();
			expect(env.createFolder).not.toHaveBeenCalled();
			expect(result.count).toBe(0);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0].path).toBe(badPath);
			expect(state.files[badPath]).toBeUndefined();
		}
	);

	it("still writes an ordinary nested path", async () => {
		const env = pullEnv({});
		const result = await executePulls(env, [{ path: "a/b.md", remoteHash: "h" }] as never, { files: {} });
		expect(env.writeFile).toHaveBeenCalledWith("a/b.md", "x");
		expect(result.count).toBe(1);
	});
});

describe("downloadAssetsForNotes keeps server asset paths inside the vault", () => {
	it.each(["../y.bin", "/../y.bin", "a/../../y.bin", "/.obsidian/plugins/trip2g/data.json"])(
		"does not write %s",
		async (absolutePath) => {
			const env = pullEnv({});
			(env.fetchNoteAssets as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ noteId: 1, path: "a.md", assets: [{ id: "x", hash: "h", url: "http://x/asset", absolutePath }] },
			]);

			const result = await downloadAssetsForNotes(env, ["a.md"]);

			expect(env.writeBinaryFile).not.toHaveBeenCalled();
			expect(env.downloadAsset).not.toHaveBeenCalled();
			expect(env.createFolder).not.toHaveBeenCalled();
			expect(result.downloaded).toBe(0);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0].message).toContain(absolutePath);
		}
	);

	function assetEnv(absolutePath: string): SyncEnv {
		const env = pullEnv({});
		(env.fetchNoteAssets as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ noteId: 1, path: "a.md", assets: [{ id: "x", hash: "h", url: "http://x/asset", absolutePath }] },
		]);
		return env;
	}

	it("skips an asset the server never stored without an error or a warning", async () => {
		const env = assetEnv("");
		const result = await downloadAssetsForNotes(env, ["a.md"]);
		expect(env.downloadAsset).not.toHaveBeenCalled();
		expect(result.errors).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});

	it.each([".attachments/a.png", "/.gitbook/assets/a.png"])("still downloads into the dot folder %s", async (absolutePath) => {
		const env = assetEnv(absolutePath);
		const result = await downloadAssetsForNotes(env, ["a.md"]);
		expect(result.downloaded).toBe(1);
		expect(env.writeBinaryFile).toHaveBeenCalledWith(absolutePath.replace(/^\//, ""), expect.anything());
	});
});

describe("executePulls reports an unsafe server path once", () => {
	it("warns a single time for a path listed twice", async () => {
		const env = pullEnv({});
		const result = await executePulls(
			env,
			[
				{ path: "../x.md", remoteHash: "h" },
				{ path: "../x.md", remoteHash: "h" },
				{ path: "ok.md", remoteHash: "h" },
			] as never,
			{ files: {} }
		);
		expect(result.warnings).toHaveLength(1);
		expect(result.errors).toHaveLength(0);
		expect(result.count).toBe(1);
	});
});


describe("references and writes the user does not control", () => {
	function planFor(path: string) {
		const c = { path, action: "unchanged", localHash: "h", remoteHash: "h" };
		return {
			classifications: [c],
			pulls: [],
			pushes: [],
			conflicts: [],
			localOnly: [],
			remoteOnly: [],
			localDeleted: [],
			serverDeleted: [],
			unchanged: 1,
		} as never;
	}

	it("stays silent for the user's own reference that leaves the vault", async () => {
		const env = pullEnv({});
		(env as unknown as { resolveAssetPath: unknown }).resolveAssetPath = vi.fn().mockResolvedValue(null);
		(env as unknown as { saveSyncState: unknown }).saveSyncState = vi.fn().mockResolvedValue(undefined);
		(env.fetchNoteAssets as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ noteId: 1, path: "a.md", assets: [{ id: "../img/a.png", hash: "", url: "", absolutePath: "" }] },
		]);
		const result = await executePlan(env, planFor("a.md"), { twoWaySync: false });
		expect(result.warnings).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	it("downgrades a refused write to a warning", async () => {
		const env = pullEnv({});
		(env.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(new PathOutsideVaultError("sub/x.md"));
		(env.writeBinaryFile as ReturnType<typeof vi.fn>).mockRejectedValue(new PathOutsideVaultError("img/a.png"));
		(env.fetchNoteAssets as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ noteId: 1, path: "sub/x.md", assets: [{ id: "x", hash: "h", url: "http://x/a", absolutePath: "img/a.png" }] },
		]);

		const pulled = await executePulls(env, [{ path: "sub/x.md", remoteHash: "h" }] as never, { files: {} });
		expect(pulled.errors).toHaveLength(0);
		expect(pulled.warnings).toHaveLength(1);

		const assets = await downloadAssetsForNotes(env, ["sub/x.md"]);
		expect(assets.errors).toHaveLength(0);
		expect(assets.warnings).toHaveLength(1);
	});
});
