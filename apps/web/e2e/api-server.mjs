// Starts the API for the Playwright suite (a `webServer` entry of
// playwright.config.ts). Plain Node, no TypeScript:
//
//   1. PostgreSQL: with E2E_DATABASE_URL set (CI service container) it uses
//      that; otherwise it starts a throwaway postgres:17 container with Docker.
//   2. Empties the schema, runs the API migrations, creates the e2e super admin.
//   3. Runs the built API (`pnpm --filter @pt/api build` runs first) until it is
//      stopped, then removes the container.
//
// Refuses any database whose name does not contain "e2e".
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, "../../api");

const PORT = process.env.E2E_API_PORT ?? "4100";
const WEB_ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PG_PORT = process.env.E2E_PG_PORT ?? "55432";
const CONTAINER =
  process.env.E2E_PG_CONTAINER ??
  (PG_PORT === "55432" ? "pt-e2e-pg" : `pt-e2e-pg-${PG_PORT}`);
const external = process.env.E2E_DATABASE_URL;
const databaseUrl =
  external || `postgres://pt:pt_e2e_only@localhost:${PG_PORT}/ptapp_e2e`;
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "e2e-admin";
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? "e2e-only-admin-password";

const databaseName = new URL(databaseUrl).pathname.slice(1);

if (!databaseName.includes("e2e")) {
  console.error(
    `e2e api: refusing database "${databaseName}" (its name must contain "e2e")`,
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const docker = (...args) =>
  spawnSync("docker", args, { encoding: "utf8", stdio: "pipe" });

const removeContainer = () => {
  if (!external) {
    docker("rm", "-f", CONTAINER);
  }
};

const startContainer = () => {
  removeContainer();
  const started = docker(
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-p",
    `${PG_PORT}:5432`,
    "-e",
    "POSTGRES_USER=pt",
    "-e",
    "POSTGRES_PASSWORD=pt_e2e_only",
    "-e",
    "POSTGRES_DB=ptapp_e2e",
    "postgres:17",
  );

  if (started.status !== 0) {
    console.error(`e2e api: docker run failed\n${started.stderr}`);
    process.exit(1);
  }
};

const waitForDatabase = async () => {
  for (let attempt = 0; attempt < 90; attempt++) {
    const client = new pg.Client({ connectionString: databaseUrl });

    try {
      await client.connect();
      await client.query("select 1");
      return client;
    } catch {
      await client.end().catch(() => undefined);
      await sleep(1000);
    }
  }
  throw new Error("e2e api: PostgreSQL did not become ready");
};

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd: apiDir,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });

    child.on("exit", (code) =>
      code === 0 ? done() : fail(new Error(`${args.join(" ")} exited ${code}`)),
    );
  });

const main = async () => {
  if (!external) {
    startContainer();
  }
  const client = await waitForDatabase();

  await client.query("drop schema public cascade; create schema public;");
  await client.end();

  const env = {
    DATABASE_URL: databaseUrl,
    PORT,
    WEB_ORIGIN,
    NODE_ENV: "development",
    // The suite logs in a lot from one address.
    LOGIN_THROTTLE_LIMIT: "100000",
    LOG_LEVEL: "warn",
  };

  await run("node", ["dist/migrate.js"], env);
  await run("node", ["--import", "tsx", "src/scripts/create-admin.ts"], {
    ...env,
    SUPER_ADMIN_USERNAME: ADMIN_USERNAME,
    SUPER_ADMIN_PASSWORD: ADMIN_PASSWORD,
  });

  const api = spawn("node", ["dist/main.js"], {
    cwd: apiDir,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  const stop = () => {
    api.kill();
    removeContainer();
  };

  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });
  process.on("exit", removeContainer);
  api.on("exit", (code) => {
    removeContainer();
    process.exit(code ?? 0);
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  removeContainer();
  process.exit(1);
});
