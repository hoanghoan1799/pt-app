import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { is } from "drizzle-orm";
import {
  getTableConfig,
  type SQLiteColumn,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";

// Dev tooling, removed at cutover together with apps/web/db/schema.ts. Reads the
// Drizzle schema and freezes every table and column, with its SQLite storage
// class and Drizzle mode, into turso-columns.json. The migration script reads
// only that JSON, so it never imports from apps/web.
//
//   pnpm --filter @pt/api data:columns
import * as schema from "../../web/db/schema.js";
import type { ColumnKind, TursoColumns } from "./turso-columns.js";

const kindOf = (column: SQLiteColumn): ColumnKind => {
  switch (column.columnType) {
    case "SQLiteTimestamp":
      return (column as unknown as { mode: string }).mode === "timestamp_ms"
        ? "timestamp_ms"
        : "timestamp_s";
    case "SQLiteBoolean":
      return "boolean";
    case "SQLiteInteger":
      return "integer";
    case "SQLiteReal":
      return "real";
    case "SQLiteText":
      return "text";
    case "SQLiteTextJson":
      return "json";
    case "SQLiteBlobBuffer":
      return "blob";
    default:
      throw new Error(
        `Unsupported column type ${column.columnType} on ${column.name}`,
      );
  }
};

const here = dirname(fileURLToPath(import.meta.url));
const tables: TursoColumns["tables"] = {};

for (const value of Object.values(schema)) {
  if (!is(value, SQLiteTable)) {
    continue;
  }

  const config = getTableConfig(value);
  const compositeKey = config.primaryKeys.flatMap((key) =>
    key.columns.map((column) => column.name),
  );
  const columnKey = config.columns
    .filter((column) => column.primary)
    .map((column) => column.name);

  tables[config.name] = {
    primaryKey: compositeKey.length > 0 ? compositeKey : columnKey,
    columns: config.columns.map((column) => ({
      name: column.name,
      sqliteType: column.getSQLType() as "integer" | "real" | "text" | "blob",
      drizzleType: column.columnType,
      kind: kindOf(column),
      notNull: column.notNull,
      autoIncrement:
        (column as unknown as { autoIncrement?: boolean }).autoIncrement ===
        true,
      ...(column.enumValues ? { enumValues: [...column.enumValues] } : {}),
    })),
  };
}

const sorted = Object.fromEntries(
  Object.entries(tables).sort(([a], [b]) => a.localeCompare(b)),
);
const output: TursoColumns = {
  source: "apps/web/db/schema.ts",
  tables: sorted,
};

writeFileSync(
  resolve(here, "turso-columns.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(`Wrote ${Object.keys(sorted).length} tables to turso-columns.json`);
