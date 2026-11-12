import { defineConfig } from "vitest/config";

import { swcPlugin } from "./vitest.swc.js";

// Tests against a real PostgreSQL 17 started by Testcontainers (needs Docker).
// The container starts once per run (test/support/global-setup.ts).
export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/support/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
