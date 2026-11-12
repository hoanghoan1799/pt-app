// PostToolUse hook for Edit/Write: runs the repo's own JS/TS tooling on the
// touched file so diffs stay clean. ESLint --fix first (import order, braces),
// then Prettier for layout. Never blocks; files a tool does not handle are
// skipped, and what --fix cannot fix is left for `pnpm lint`.
// ESLint runs inside the workspace that owns the file (apps/web, apps/api,
// packages/contracts), where its config and plugins are installed; Prettier
// runs from the repo root.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const ESLINT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const ESLINT_CONFIG = "eslint.config.mjs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const filePath = input.tool_input?.file_path;
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// The nearest folder at or above the file with an ESLint config, inside the repo.
const findEslintWorkspace = (file) => {
  let dir = dirname(resolve(file));

  while (dir.startsWith(resolve(projectDir)) && dir !== dirname(dir)) {
    if (existsSync(join(dir, ESLINT_CONFIG))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return null;
};

const run = (script, args, cwd) => {
  if (existsSync(script)) {
    spawnSync(process.execPath, [script, ...args, filePath], {
      cwd,
      stdio: ["ignore", "ignore", "ignore"],
    });
  }
};

if (filePath && existsSync(filePath)) {
  const workspace = findEslintWorkspace(filePath);

  if (workspace && ESLINT_EXTENSIONS.includes(extname(filePath))) {
    run(
      join(workspace, "node_modules", "eslint", "bin", "eslint.js"),
      ["--fix", "--no-warn-ignored"],
      workspace,
    );
  }
  run(
    join(projectDir, "node_modules", "prettier", "bin", "prettier.cjs"),
    ["--write", "--ignore-unknown", "--log-level", "silent"],
    projectDir,
  );
}
