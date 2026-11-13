import { spawnSync } from "node:child_process";

import { E2E_PG_CONTAINER } from "./config";

// api-server.mjs removes its PostgreSQL container when it stops; on Windows
// Playwright may end it without letting it clean up, so remove it here too.
// A database from E2E_DATABASE_URL (CI service container) is left alone.
const globalTeardown = () => {
  if (!process.env.E2E_DATABASE_URL) {
    spawnSync("docker", ["rm", "-f", E2E_PG_CONTAINER], { stdio: "ignore" });
  }
};

export default globalTeardown;
