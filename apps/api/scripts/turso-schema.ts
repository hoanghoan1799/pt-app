import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The frozen SQLite DDL of the old production database (turso-schema.sql), as
// one statement per entry.
const BREAKPOINT = "--> statement-breakpoint";

export const loadTursoSchemaStatements = (): string[] =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "turso-schema.sql"),
    "utf8",
  )
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
