import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { type Client, createClient } from "@libsql/client";

import type { TableSpec, TursoColumns } from "../turso-columns.js";
import { applyDefaults } from "./constraints.js";
import type { SourceValue } from "./convert.js";

export type SourceRow = Record<string, SourceValue>;

// Tables SQLite, drizzle-kit and Turso create themselves; never application data.
const INTERNAL_TABLE = /^(sqlite_|__drizzle|_litestream|libsql_|_cf_)/;

export const isLocalFile = (url: string) => url.startsWith("file:");

// The host a remote URL points at, for the warning. Never the token, never the
// query string (it can carry ?authToken=).
export const describeSourceHost = (url: string) => {
  try {
    return new URL(url).host || "unknown host";
  } catch {
    return "unparseable URL";
  }
};

const localPath = (url: string) =>
  url.startsWith("file://") ? fileURLToPath(url) : url.slice("file:".length);

export const openSource = (
  url: string,
  authToken: string | undefined,
): Client => {
  if (isLocalFile(url)) {
    const path = localPath(url).split("?")[0];

    // libSQL would silently create an empty database for a mistyped path.
    if (!existsSync(path)) {
      throw new Error("Source SQLite file does not exist");
    }
  }

  return createClient({
    url,
    authToken: isLocalFile(url) ? undefined : authToken,
    intMode: "number",
  });
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

// Fails when the source and the frozen mapping disagree. A column or table the
// mapping does not know would be left behind, so both directions are errors.
export const checkSourceSchema = async (
  client: Client,
  mapping: TursoColumns,
) => {
  const problems: string[] = [];
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  const present = new Set(tables.rows.map((row) => String(row.name)));

  for (const name of present) {
    if (!mapping.tables[name] && !INTERNAL_TABLE.test(name)) {
      problems.push(`source table ${name} is not in turso-columns.json`);
    }
  }

  for (const [name, spec] of Object.entries(mapping.tables)) {
    if (!present.has(name)) {
      problems.push(`source is missing table ${name}`);
      continue;
    }

    const info = await client.execute(`PRAGMA table_info(${quote(name)})`);
    const sourceColumns = new Set(info.rows.map((row) => String(row.name)));
    const mapped = new Set(spec.columns.map((column) => column.name));

    for (const column of sourceColumns) {
      if (!mapped.has(column)) {
        problems.push(
          `source column ${name}.${column} is not in turso-columns.json`,
        );
      }
    }

    for (const column of mapped) {
      if (!sourceColumns.has(column)) {
        problems.push(`source is missing column ${name}.${column}`);
      }
    }
  }

  return problems;
};

const toSourceValue = (value: unknown): SourceValue => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return value as number | string;
};

export const countRows = async (client: Client, table: string) => {
  const result = await client.execute(
    `SELECT count(*) AS n FROM ${quote(table)}`,
  );

  return Number(result.rows[0].n);
};

// Pages through a table in primary key order (stable, so no row is read twice).
export async function* readTable(
  client: Client,
  table: string,
  spec: TableSpec,
  batchSize: number,
): AsyncGenerator<SourceRow[]> {
  const columns = spec.columns.map((column) => quote(column.name)).join(", ");
  const order = spec.primaryKey.map(quote).join(", ");

  for (let offset = 0; ; offset += batchSize) {
    const result = await client.execute({
      sql: `SELECT ${columns} FROM ${quote(table)} ORDER BY ${order} LIMIT ? OFFSET ?`,
      args: [batchSize, offset],
    });

    if (result.rows.length === 0) {
      return;
    }

    yield result.rows.map((row) =>
      applyDefaults(
        table,
        Object.fromEntries(
          spec.columns.map((column) => [
            column.name,
            toSourceValue(row[column.name]),
          ]),
        ),
      ),
    );

    if (result.rows.length < batchSize) {
      return;
    }
  }
}
