import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// How a SQLite column is read and compared:
// - timestamp_s / timestamp_ms: integer epoch seconds / milliseconds
// - boolean: integer 0 or 1
// - json: text holding JSON (copied as text)
// - blob: Buffer
export type ColumnKind =
  | "integer"
  | "real"
  | "text"
  | "json"
  | "boolean"
  | "timestamp_s"
  | "timestamp_ms"
  | "blob";

export type ColumnSpec = {
  name: string;
  // SQLite storage class.
  sqliteType: "integer" | "real" | "text" | "blob";
  // Drizzle column class, e.g. SQLiteTimestamp.
  drizzleType: string;
  kind: ColumnKind;
  notNull: boolean;
  autoIncrement: boolean;
  enumValues?: string[];
};

export type TableSpec = {
  primaryKey: string[];
  columns: ColumnSpec[];
};

export type TursoColumns = {
  source: string;
  tables: Record<string, TableSpec>;
};

// Frozen by generate-turso-columns.ts; the migration never reads apps/web.
export const loadTursoColumns = (): TursoColumns =>
  JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "turso-columns.json"),
      "utf8",
    ),
  ) as TursoColumns;
