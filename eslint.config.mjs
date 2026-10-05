import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Sorted imports, in blank-line-separated groups: side effects, Node
    // built-ins, packages, app code via the `@/` alias, then relative imports.
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": [
        "error",
        { groups: [["^\\u0000"], ["^node:"], ["^@?\\w"], ["^@/"], ["^\\."]] },
      ],
      "simple-import-sort/exports": "error",
      // Every if/else/for/while body is a braced block, even a single return.
      curly: ["error", "all"],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
