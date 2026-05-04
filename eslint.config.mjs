import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "*.config.*"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      prettier: prettierPlugin,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
      "react-hooks": reactHooks,
    },
    rules: {
      // Prettier as an ESLint rule — one command does formatting + linting
      "prettier/prettier": "error",

      // Import sorting and cleanup
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "unused-imports/no-unused-imports": "error",

      // React hooks invariants — catches "hook after early return" and similar
      // ordering bugs at lint time instead of runtime.
      "react-hooks/rules-of-hooks": "error",

      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Test files use patterns that don't fit production code: `(x as any)` casts for stubs,
    // non-null assertions on `getByText(...)!`, and `expect(...).toBe(undefined)` style
    // assertions on private fields. Relax those rules in tests only.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
