import { describe, it, expect } from "vitest";
import { resolveAssetPath, type ResolveEnv } from "./resolve";

/**
 * Create mock env with specified existing files.
 */
function createEnv(existingFiles: string[]): ResolveEnv {
	const fileSet = new Set(existingFiles);
	return {
		fileExistsSync: (path: string) => fileSet.has(path),
	};
}

describe("resolveAssetPath", () => {
	describe("root priority (Obsidian's shortest path rule)", () => {
		it("resolves to root when file exists at root only", () => {
			const env = createEnv(["image.png"]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBe("image.png");
		});

		it("resolves to root when file exists at both root and folder", () => {
			// Key Obsidian behavior: root wins!
			const env = createEnv(["image.png", "folder/image.png"]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBe("image.png");
		});

		it("resolves to folder when file exists only in folder", () => {
			const env = createEnv(["folder/image.png"]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBe("folder/image.png");
		});

		it("resolves to assets folder when file exists only there", () => {
			const env = createEnv(["assets/image.png"]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBe("assets/image.png");
		});

		it("prefers root over assets folder", () => {
			const env = createEnv(["image.png", "assets/image.png"]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBe("image.png");
		});

		it("prefers assets over relative folder", () => {
			const env = createEnv(["assets/image.png", "folder/image.png"]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBe("assets/image.png");
		});
	});

	describe("explicit relative path (./)", () => {
		it("resolves ./image.png relative to note", () => {
			const env = createEnv(["folder/image.png"]);
			expect(resolveAssetPath(env, "./image.png", "folder/note.md")).toBe("folder/image.png");
		});

		it("ignores root when using explicit relative", () => {
			// Even though root has the file, ./ forces relative resolution
			const env = createEnv(["image.png", "folder/image.png"]);
			expect(resolveAssetPath(env, "./image.png", "folder/note.md")).toBe("folder/image.png");
		});

		it("returns null if relative file not found", () => {
			const env = createEnv(["image.png"]); // only at root
			expect(resolveAssetPath(env, "./image.png", "folder/note.md")).toBeNull();
		});
	});

	describe("explicit absolute path (/)", () => {
		it("resolves /image.png from root", () => {
			const env = createEnv(["image.png"]);
			expect(resolveAssetPath(env, "/image.png", "folder/note.md")).toBe("image.png");
		});

		it("resolves /folder/image.png correctly", () => {
			const env = createEnv(["folder/image.png"]);
			expect(resolveAssetPath(env, "/folder/image.png", "other/note.md")).toBe("folder/image.png");
		});

		it("returns null if absolute path not found", () => {
			const env = createEnv(["folder/image.png"]);
			expect(resolveAssetPath(env, "/image.png", "folder/note.md")).toBeNull();
		});
	});

	describe("explicit path with folder", () => {
		it("resolves subfolder/image.png directly", () => {
			const env = createEnv(["subfolder/image.png"]);
			expect(resolveAssetPath(env, "subfolder/image.png", "note.md")).toBe("subfolder/image.png");
		});

		it("does not search elsewhere for explicit paths", () => {
			const env = createEnv(["other/image.png"]); // wrong folder
			expect(resolveAssetPath(env, "subfolder/image.png", "note.md")).toBeNull();
		});
	});

	describe("note at root level", () => {
		it("resolves image at root for root-level note", () => {
			const env = createEnv(["image.png"]);
			expect(resolveAssetPath(env, "image.png", "note.md")).toBe("image.png");
		});

		it("does not try empty relative path for root note", () => {
			const env = createEnv(["assets/image.png"]);
			expect(resolveAssetPath(env, "image.png", "note.md")).toBe("assets/image.png");
		});
	});

	describe("nested folders", () => {
		it("resolves from deeply nested note", () => {
			const env = createEnv(["image.png"]);
			expect(resolveAssetPath(env, "image.png", "a/b/c/note.md")).toBe("image.png");
		});

		it("resolves relative in deeply nested folder", () => {
			const env = createEnv(["a/b/c/image.png"]);
			expect(resolveAssetPath(env, "image.png", "a/b/c/note.md")).toBe("a/b/c/image.png");
		});

		it("prefers root over deeply nested relative", () => {
			const env = createEnv(["image.png", "a/b/c/image.png"]);
			expect(resolveAssetPath(env, "image.png", "a/b/c/note.md")).toBe("image.png");
		});
	});

	describe("file not found", () => {
		it("returns null when file does not exist anywhere", () => {
			const env = createEnv([]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBeNull();
		});

		it("returns null for non-matching paths", () => {
			const env = createEnv(["other.png", "folder/other.png"]);
			expect(resolveAssetPath(env, "image.png", "folder/note.md")).toBeNull();
		});
	});

	describe("edge cases", () => {
		it("handles empty asset path", () => {
			const env = createEnv([""]);
			expect(resolveAssetPath(env, "", "note.md")).toBe("");
		});

		it("handles asset with spaces", () => {
			const env = createEnv(["my image.png"]);
			expect(resolveAssetPath(env, "my image.png", "note.md")).toBe("my image.png");
		});

		it("handles unicode filenames", () => {
			const env = createEnv(["изображение.png"]);
			expect(resolveAssetPath(env, "изображение.png", "note.md")).toBe("изображение.png");
		});
	});
});
