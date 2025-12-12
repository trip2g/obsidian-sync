import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  // Ignore patterns first
  {
    ignores: ["node_modules/", "main.js", "*.mjs", "src/graphql.ts"],
  },

  // Obsidian plugin recommended rules
  ...obsidianmd.configs.recommended,

  // TypeScript files config
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript rules
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",

      // Obsidian rules
      "obsidianmd/sample-names": "off",
      "no-restricted-globals": "off",
      "no-console": "off",
    },
  }
);
