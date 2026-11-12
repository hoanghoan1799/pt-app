import { randomBytes } from "node:crypto";

import { Client } from "pg";
import { DataSource } from "typeorm";
import { inject } from "vitest";

import { buildDataSourceOptions } from "../../src/database/data-source-options.js";

export const TEMPLATE_DB = "pt_template";

export const urlForDatabase = (baseUrl: string, database: string) => {
  const url = new URL(baseUrl);

  url.pathname = `/${database}`;
  return url.toString();
};

export const adminClient = async (baseUrl: string) => {
  const client = new Client({ connectionString: baseUrl });

  await client.connect();
  return client;
};

export type TestDatabase = {
  url: string;
  dataSource: DataSource;
  // Closes the connection and drops the database.
  drop: () => Promise<void>;
};

// An isolated database per test file. `migrated: true` (default) clones the
// template with every migration applied; `false` gives an empty database for
// tests of the migrations themselves. The DataSource is already initialized.
export const createTestDatabase = async (
  options: { migrated?: boolean } = {},
): Promise<TestDatabase> => {
  const baseUrl = inject("pgBaseUrl");
  const name = `t_${randomBytes(6).toString("hex")}`;
  const template = options.migrated === false ? "template0" : TEMPLATE_DB;

  const admin = await adminClient(baseUrl);
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${template}`);
  await admin.end();

  const url = urlForDatabase(baseUrl, name);
  const dataSource = new DataSource(buildDataSourceOptions(url));

  await dataSource.initialize();

  return {
    url,
    dataSource,
    drop: async () => {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }

      const cleanup = await adminClient(baseUrl);

      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.end();
    },
  };
};
