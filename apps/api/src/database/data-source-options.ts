import pg from "pg";
import type { DataSourceOptions } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

import { migrations } from "../migrations/index.js";
import { entities } from "./entities/index.js";

const DATE_OID = 1082;

// PostgreSQL `date` columns hold plain calendar days. The driver would turn
// them into a Date at local midnight, which shifts the day with the server's
// time zone; the app works with "YYYY-MM-DD" strings, so they stay strings.
export const pgTypes = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === DATE_OID
      ? (value: string) => value
      : pg.types.getTypeParser(
          oid,
          format as "text",
        )) as typeof pg.types.getTypeParser,
};

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
  extra: { types: pgTypes },
});
