import type { Client } from "pg";

import { migrations } from "../../src/migrations/index.js";
import type { TursoColumns } from "../turso-columns.js";
import {
  AVATAR_TARGET_TABLES,
  isMovedColumn,
  MOVED_AVATARS,
} from "./avatars.js";
import type { PgColumnInfo } from "./convert.js";
import type { ForeignKey } from "./plan.js";

// PostgreSQL columns the SQLite schema never had, set on every copied row.
export const EXTRA_COLUMNS: Record<string, Record<string, unknown>> = {
  push_subscriptions: { kind: "web" },
};

export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export type TargetSchema = {
  columns: Map<string, Map<string, PgColumnInfo>>;
  identityTables: Set<string>;
  foreignKeys: ForeignKey[];
  // "table.column" -> values of its single-column text CHECK ... IN (...).
  enumChecks: Map<string, string[]>;
  problems: string[];
};

// Which PostgreSQL types can hold each SQLite kind.
const COMPATIBLE: Record<string, string[]> = {
  integer: ["integer", "bigint", "smallint"],
  boolean: ["boolean"],
  timestamp_s: ["timestamp with time zone"],
  timestamp_ms: ["timestamp with time zone"],
  real: ["double precision", "real"],
  text: ["text", "character varying"],
  json: ["text", "jsonb", "json"],
  blob: ["bytea"],
};

// Literals of `CHECK (col IN ('a', 'b'))` as PostgreSQL prints it.
export const parseCheckValues = (definition: string) => {
  if (!/\bANY \(ARRAY\[|\bIN \(/i.test(definition)) {
    return null;
  }

  return [...definition.matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
    match[1].replaceAll("''", "'"),
  );
};

// The tables the avatar columns of users and admins moved to.
const AVATAR_TABLE_COLUMNS: Record<
  string,
  Record<string, string>
> = Object.fromEntries(
  MOVED_AVATARS.map(({ targetTable: table, targetKey: key }) => [
    table,
    {
      [key]: "integer",
      mime: "text",
      data: "bytea",
      size: "integer",
      updated_at: "timestamp with time zone",
    },
  ]),
);

// Reads the target schema (never the data): columns, identity columns, foreign
// keys and CHECK values. The migration is driven by what PostgreSQL has, and
// compared with the frozen mapping so drift fails before any write.
export const introspectTarget = async (
  client: Client,
  mapping: TursoColumns,
): Promise<TargetSchema> => {
  const names = Object.keys(mapping.tables);
  const problems: string[] = [];

  const columnRows = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    is_identity: string;
    column_default: string | null;
  }>(
    `SELECT table_name, column_name, data_type, is_nullable, is_identity, column_default
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [[...names, ...AVATAR_TARGET_TABLES]],
  );

  const columns = new Map<string, Map<string, PgColumnInfo>>();
  const identityTables = new Set<string>();

  for (const row of columnRows.rows) {
    const table = columns.get(row.table_name) ?? new Map();

    table.set(row.column_name, {
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
    });
    columns.set(row.table_name, table);

    if (row.is_identity === "YES") {
      identityTables.add(row.table_name);
    }
  }

  for (const [name, spec] of Object.entries(mapping.tables)) {
    const table = columns.get(name);

    if (!table) {
      problems.push(`target is missing table ${name}`);
      continue;
    }

    for (const column of spec.columns) {
      // Moved to its own table (see avatars.ts): not a column here any more.
      if (isMovedColumn(name, column.name)) {
        continue;
      }

      const info = table.get(column.name);

      if (!info) {
        problems.push(`target is missing column ${name}.${column.name}`);
      } else if (!COMPATIBLE[column.kind].includes(info.dataType)) {
        problems.push(
          `target ${name}.${column.name} is ${info.dataType}, expected a type for ${column.kind}`,
        );
      }
    }

    const mapped = new Set(spec.columns.map((column) => column.name));

    for (const row of columnRows.rows) {
      if (
        row.table_name === name &&
        !mapped.has(row.column_name) &&
        !(row.column_name in (EXTRA_COLUMNS[name] ?? {})) &&
        row.is_nullable === "NO" &&
        row.column_default === null &&
        row.is_identity !== "YES"
      ) {
        problems.push(
          `target column ${name}.${row.column_name} is NOT NULL with no default and not in the mapping`,
        );
      }
    }
  }

  for (const [table, expected] of Object.entries(AVATAR_TABLE_COLUMNS)) {
    const actual = columns.get(table);

    if (!actual) {
      problems.push(`target is missing table ${table}`);
      continue;
    }

    for (const [column, dataType] of Object.entries(expected)) {
      if (actual.get(column)?.dataType !== dataType) {
        problems.push(
          `target ${table}.${column} should be ${dataType}, found ${actual.get(column)?.dataType ?? "no such column"}`,
        );
      }
    }
  }

  const fkRows = await client.query<{
    child: string;
    parent: string;
    cols: string[];
    pcols: string[];
    nullable: boolean;
  }>(
    `SELECT cl.relname AS child, pcl.relname AS parent,
            array_agg(a.attname::text ORDER BY k.ord) AS cols,
            array_agg(pa.attname::text ORDER BY k.ord) AS pcols,
            bool_and(NOT a.attnotnull) AS nullable
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_class pcl ON pcl.oid = c.confrelid
      CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(attnum, pattnum, ord)
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.pattnum
      WHERE c.contype = 'f' AND n.nspname = current_schema()
      GROUP BY c.oid, cl.relname, pcl.relname`,
  );

  const foreignKeys: ForeignKey[] = [];

  for (const row of fkRows.rows) {
    // Foreign keys of tables outside the 44 (sessions) are not copied.
    if (!mapping.tables[row.child] || !mapping.tables[row.parent]) {
      continue;
    }

    if (row.cols.length !== 1) {
      problems.push(`composite foreign key on ${row.child} is not supported`);
      continue;
    }

    foreignKeys.push({
      table: row.child,
      column: row.cols[0],
      parentTable: row.parent,
      parentColumn: row.pcols[0],
      nullable: row.nullable,
    });
  }

  const checkRows = await client.query<{
    table_name: string;
    column_name: string;
    definition: string;
  }>(
    `SELECT cl.relname AS table_name, a.attname AS column_name,
            pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'c' AND array_length(c.conkey, 1) = 1
        AND n.nspname = current_schema() AND cl.relname = ANY($1)`,
    [names],
  );

  const enumChecks = new Map<string, string[]>();

  for (const row of checkRows.rows) {
    const values = parseCheckValues(row.definition);

    if (values) {
      enumChecks.set(`${row.table_name}.${row.column_name}`, values);
    }
  }

  return { columns, identityTables, foreignKeys, enumChecks, problems };
};

// The baseline has to be applied: the script never changes the schema.
export const pendingMigrations = async (client: Client) => {
  const exists = await client.query<{ present: boolean }>(
    "SELECT to_regclass('migrations') IS NOT NULL AS present",
  );
  const applied = exists.rows[0].present
    ? (await client.query<{ name: string }>("SELECT name FROM migrations")).rows
    : [];
  const done = new Set(applied.map((row) => row.name));

  return migrations
    .map((migration) => migration.name)
    .filter((name) => !done.has(name));
};

// Tables with rows, over the 44, the avatar tables and sessions.
export const tablesWithRows = async (client: Client, tables: string[]) => {
  const filled: string[] = [];

  for (const table of [...tables, ...AVATAR_TARGET_TABLES, "sessions"]) {
    const result = await client.query<{ present: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ${quote(table)}) AS present`,
    );

    if (result.rows[0].present) {
      filled.push(table);
    }
  }

  return filled;
};

// One INSERT for a batch of rows. OVERRIDING SYSTEM VALUE keeps the ids on
// GENERATED ALWAYS identity columns.
export const buildInsert = (
  table: string,
  columns: string[],
  rowCount: number,
  identity: boolean,
) => {
  const placeholders = Array.from(
    { length: rowCount },
    (_, row) =>
      `(${columns.map((_column, col) => `$${row * columns.length + col + 1}`).join(", ")})`,
  ).join(", ");

  return `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})${
    identity ? " OVERRIDING SYSTEM VALUE" : ""
  } VALUES ${placeholders}`;
};

// Identity sequences continue after the highest id; an empty table starts at 1.
export const resetSequences = async (client: Client, tables: string[]) => {
  for (const table of tables) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(max(id), 1), max(id) IS NOT NULL) FROM ${quote(table)}`,
      [quote(table)],
    );
  }
};

export type SequenceCheck = {
  table: string;
  maxId: number | null;
  // The value nextval() would return, read without consuming it.
  next: number;
  ok: boolean;
};

export const checkSequences = async (client: Client, tables: string[]) => {
  const checks: SequenceCheck[] = [];

  for (const table of tables) {
    const max = await client.query<{ max: number | null }>(
      `SELECT max(id) AS max FROM ${quote(table)}`,
    );
    const sequence = await client.query<{ last_value: string | null }>(
      `SELECT ps.last_value
         FROM pg_sequences ps
        WHERE ps.schemaname || '.' || ps.sequencename =
              replace(pg_get_serial_sequence($1, 'id'), '"', '')`,
      [quote(table)],
    );
    const maxId = max.rows[0].max;
    const last = sequence.rows[0]?.last_value;
    const next = last === null || last === undefined ? 1 : Number(last) + 1;

    checks.push({
      table,
      maxId,
      next,
      ok: next === (maxId ?? 0) + 1,
    });
  }

  return checks;
};
