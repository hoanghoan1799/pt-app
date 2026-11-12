import { defineConfig } from "vitest/config";

// Repo tooling tests that live outside the workspaces (Claude Code hooks).
export default defineConfig({
  test: {
    environment: "node",
    include: [".claude/**/*.test.ts"],
  },
});
