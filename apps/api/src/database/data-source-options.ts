import type { DataSourceOptions } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

import { migrations } from "../migrations/index.js";
import { entities } from "./entities/index.js";

// One definition for the running app, the TypeORM CLI and the tests, so the
// schema they see can never drift apart.
export const buildDataSourceOptions = (url: string): DataSourceOptions => ({
  type: "postgres",
  url,
  entities,
  migrations,
  namingStrategy: new SnakeNamingStrategy(),
  // Schema changes only ever go through reviewed migrations.
  synchronize: false,
  migrationsRun: false,
  // Session ids use gen_random_uuid(), built in since PostgreSQL 13.
  uuidExtension: "pgcrypto",
  installExtensions: false,
});
