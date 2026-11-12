import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { relative } from "node:path";

import { E2E_DB_PATH, E2E_DB_URL, E2E_ENV, E2E_TMP_DIR } from "./config";
import { seedE2eDatabase } from "./seed";

// Refuses anything but a scratch SQLite file inside e2e/.tmp, so a misread
// env can never point the suite at Turso.
const assertScratchDatabase = () => {
  const urls = [E2E_ENV.DATABASE_URL, E2E_ENV.TURSO_DATABASE_URL];
  const isScratch = urls.every(
    (url) =>
      url === E2E_DB_URL &&
      url.startsWith("file:") &&
      !relative(E2E_TMP_DIR, E2E_DB_PATH).startsWith(".."),
  );

  if (!isScratch) {
    throw new Error("e2e: the database must be a file: URL inside e2e/.tmp");
  }
};

const globalSetup = async () => {
  assertScratchDatabase();
  rmSync(E2E_TMP_DIR, { recursive: true, force: true });
  mkdirSync(E2E_TMP_DIR, { recursive: true });

  // Same variables as the web server; the shell's own values are overridden.
  execSync("pnpm exec drizzle-kit push", {
    stdio: "inherit",
    env: { ...process.env, ...E2E_ENV },
  });

  if (!existsSync(E2E_DB_PATH)) {
    throw new Error("e2e: drizzle-kit push did not create the scratch DB");
  }
  await seedE2eDatabase(E2E_DB_URL);
};

export default globalSetup;
