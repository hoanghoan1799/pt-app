import { defineConfig } from "vitest/config";

import { swcPlugin } from "./vitest.swc.js";

// Fast unit tests: no Docker, no database. Container tests: vitest.e2e.config.ts.
export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
