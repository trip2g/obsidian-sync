import { describe, it, expect, vi } from "vitest";

import { ObsidianSyncEnv } from "./env";

function createEnv(folderPath: string) {
	const vault = {
		getAbstractFileByPath: vi.fn().mockReturnValue(null),
		create: vi.fn().mockResolvedValue(undefined),
		createBinary: vi.fn().mockResolvedValue(undefined),
		createFolder: vi.fn().mockResolvedValue(undefined),
	};
	const env = new ObsidianSyncEnv({
		app: { vault, fileManager: {}, metadataCache: {} } as never,
		sdk: {} as never,
		folder: { path: folderPath } as never,
		syncState: { files: {} },
		apiUrl: "http://localhost:1",
		apiKey: "k",
		pluginVersion: "0",
		twoWaySync: true,
		onProgressCallback: vi.fn(),
		onConflictCallback: vi.fn(),
		onAssetConflictCallback: vi.fn(),
		onServerDeletedCallback: vi.fn(),
		confirmPushCallback: vi.fn(),
		saveSyncStateCallback: vi.fn(),
	});
	return { env, vault };
}

describe("ObsidianSyncEnv keeps file operations inside the synced folder", () => {
	it.each(["sub", "/"])("rejects paths that leave the folder %s", async (folderPath) => {
		const { env, vault } = createEnv(folderPath);

		await expect(env.writeFile("../x.md", "x")).rejects.toThrow();
		await expect(env.writeFile("a/../../x.md", "x")).rejects.toThrow();
		await expect(env.writeBinaryFile("/abs.bin", new ArrayBuffer(1))).rejects.toThrow();
		await expect(env.writeBinaryFile(".obsidian/plugins/trip2g/data.json", new ArrayBuffer(1))).rejects.toThrow();
		await expect(env.createFolder("../d")).rejects.toThrow();
		await expect(env.readBinaryFile("../x.bin")).rejects.toThrow();

		expect(vault.create).not.toHaveBeenCalled();
		expect(vault.createBinary).not.toHaveBeenCalled();
		expect(vault.createFolder).not.toHaveBeenCalled();
	});

	it("still writes an ordinary nested path under the folder", async () => {
		const { env, vault } = createEnv("sub");
		await env.writeFile("a/b.md", "x");
		expect(vault.create).toHaveBeenCalledWith("sub/a/b.md", "x");
	});
});
