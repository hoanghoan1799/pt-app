import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { DataSource } from "typeorm";
import type { TestProject } from "vitest/node";

import { buildDataSourceOptions } from "../../src/database/data-source-options.js";
import { adminClient, TEMPLATE_DB, urlForDatabase } from "./database.js";

declare module "vitest" {
  export interface ProvidedContext {
    // Connection URL of the container's default database.
    pgBaseUrl: string;
  }
}

// Starts PostgreSQL 17 once, then builds a template database with every
// migration applied. Each test file clones it in milliseconds.
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const baseUrl = container.getConnectionUri();

  const admin = await adminClient(baseUrl);
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await admin.end();

  const template = new DataSource(
    buildDataSourceOptions(urlForDatabase(baseUrl, TEMPLATE_DB)),
  );
  await template.initialize();
  await template.runMigrations({ transaction: "each" });
  await template.destroy();

  project.provide("pgBaseUrl", baseUrl);

  return async () => {
    await container.stop();
  };
}
