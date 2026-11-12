import { defineConfig, devices } from "@playwright/test";

import {
  E2E_API_PORT,
  E2E_API_URL,
  E2E_BASE_URL,
  E2E_ENV,
  E2E_PG_CONTAINER,
  E2E_PG_PORT,
  E2E_PORT,
} from "./e2e/config";

// Lets context.route see (and abort) requests made by the service worker; the
// offline spec of e2e/pwa.spec.ts needs it. Read when the browser launches.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // The specs share one seeded SQLite file and run in order.
  workers: 1,
  fullyParallel: false,
  // No retries: the specs mutate one shared DB, so a rerun would not start clean.
  retries: 0,
  reporter: isCi ? "github" : "list",
  outputDir: "./e2e/.tmp/results",
  expect: { timeout: 15_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    video: process.env.E2E_VIDEO ? "on" : "off",
    // iPhone 12 viewport (390 px) is also what B12 asserts on.
    ...devices["iPhone 12"],
    // The iPhone preset defaults to WebKit; CI only installs Chromium.
    defaultBrowserType: "chromium",
    // Optional: E2E_BROWSER_CHANNEL=chrome (or msedge) uses an installed browser
    // instead of the one `playwright install` downloads.
    ...(process.env.E2E_BROWSER_CHANNEL
      ? { channel: process.env.E2E_BROWSER_CHANNEL }
      : {}),
  },
  projects: [{ name: "mobile-chromium" }],
  // 1. the API with its own PostgreSQL (e2e/api-server.mjs), 2. the web app
  // that calls it. Seeding happens in globalSetup, once both answer.
  webServer: [
    {
      command: "pnpm --filter @pt/api build && node e2e/api-server.mjs",
      url: `${E2E_API_URL}/v1/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: "pipe",
      env: {
        E2E_API_PORT: String(E2E_API_PORT),
        E2E_PG_PORT: String(E2E_PG_PORT),
        E2E_PG_CONTAINER,
        E2E_BASE_URL,
      },
    },
    {
      command: `pnpm exec next dev -p ${E2E_PORT}`,
      url: `${E2E_BASE_URL}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...E2E_ENV, NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
