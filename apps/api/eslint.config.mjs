import { defineConfig, globalIgnores } from "eslint/config";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    // Same house rules as the web app: sorted import groups, braces everywhere.
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": [
        "error",
        { groups: [["^\\u0000"], ["^node:"], ["^@?\\w"], ["^\\."]] },
      ],
      "simple-import-sort/exports": "error",
      curly: ["error", "all"],
    },
  },
  globalIgnores(["dist/**"]),
]);
