import "reflect-metadata";

import { DataSource } from "typeorm";

import { buildDataSourceOptions } from "./database/data-source-options.js";

// DataSource for the TypeORM CLI (`pnpm --filter @pt/api migration:*`) and for
// the production migration runner (migrate.ts). Only DATABASE_URL is needed.
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Missing: DATABASE_URL (copy apps/api/.env.example to apps/api/.env)",
  );
}

export default new DataSource(buildDataSourceOptions(url));
