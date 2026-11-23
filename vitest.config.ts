import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, "src/__stubs__/obsidian.ts"),
		},
	},
});
