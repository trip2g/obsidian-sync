import { describe, it, expect, vi } from "vitest";
import { resolveAssetPath, type ResolveEnv } from "./resolve";
import { executePulls, downloadAssetsForNotes } from "./execute";
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
			expect(result.errors).toHaveLength(1);
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
			expect(result.errors).toHaveLength(1);
		}
	);
});
