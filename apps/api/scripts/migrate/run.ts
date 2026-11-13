import { writeFileSync } from "node:fs";

import type { Client as LibsqlClient } from "@libsql/client";
import { Client } from "pg";

import { pgTypes } from "../../src/database/data-source-options.js";
import { loadTursoColumns, type TursoColumns } from "../turso-columns.js";
import {
  hashRow,
  normalizeSource,
  normalizeTarget,
  type SourceValue,
  tableChecksum,
  toPgValue,
  validateValue,
} from "./convert.js";
import {
  type LoadPlan,
  type OrphanMode,
  type OrphanResolution,
  planLoad,
  resolveOrphans,
  type RowRef,
} from "./plan.js";
import {
  emptyReport,
  formatError,
  formatTable,
  makeRedactor,
  type Report,
} from "./report.js";
import {
  checkSourceSchema,
  countRows,
  describeSourceHost,
  isLocalFile,
  openSource,
  readTable,
} from "./source.js";
import {
  buildInsert,
  checkSequences,
  EXTRA_COLUMNS,
  introspectTarget,
  pendingMigrations,
  quote,
  resetSequences,
  tablesWithRows,
  type TargetSchema,
} from "./target.js";

export type RunOptions = {
  mode: "migrate" | "verify" | "dry-run";
  source: string;
  target: string;
  // Only ever from the TURSO_AUTH_TOKEN environment variable.
  authToken?: string;
  orphans: OrphanMode;
  reset: boolean;
  allowRemote: boolean;
  batchSize: number;
  reportPath?: string;
};

export type RunResult = { exitCode: number; report: Report };

type Log = (line: string) => void;

// Postgres allows 65535 parameters per statement.
const MAX_PARAMS = 60_000;
const BLOB_BATCH = 20;
const SAMPLES_PER_COLUMN = 10;
const SCRYPT_FORMAT = /^scrypt\$\d+\$[^$]+\$[^$]+$/;
const BIG_BLOB_BYTES = 10 * 1024 * 1024;

class Abort extends Error {}

type Analysis = {
  counts: Record<string, number>;
  rows: Record<string, RowRef[]>;
  invalid: Report["invalidValues"];
  blobs: Report["blobs"];
  warnings: string[];
};

const keyOf = (primaryKey: string[], row: Record<string, SourceValue>) =>
  primaryKey.map((column) => String(row[column])).join(":");

const batchFor = (mapping: TursoColumns, table: string, batchSize: number) =>
  mapping.tables[table].columns.some((column) => column.kind === "blob")
    ? Math.min(batchSize, BLOB_BATCH)
    : batchSize;

// Reads every table once: validates each value against the PostgreSQL column
// and its CHECK values, and collects the ids the orphan scan needs.
const analyse = async (
  source: LibsqlClient,
  mapping: TursoColumns,
  schema: TargetSchema,
  batchSize: number,
  log: Log,
): Promise<Analysis> => {
  const counts: Record<string, number> = {};
  const rows: Record<string, RowRef[]> = {};
  const invalid = new Map<string, Report["invalidValues"][number]>();
  const blobColumns = new Map<string, Report["blobs"]["byColumn"][number]>();
  const hashFormat = new Map<string, number>();

  const flag = (
    table: string,
    column: string,
    key: string,
    problem: string,
  ) => {
    const id = `${table}.${column}`;
    const group = invalid.get(id) ?? { table, column, count: 0, samples: [] };

    group.count += 1;

    if (group.samples.length < SAMPLES_PER_COLUMN) {
      group.samples.push({ key, problem });
    }

    invalid.set(id, group);
  };

  for (const [table, spec] of Object.entries(mapping.tables)) {
    const needed = new Set<string>();

    for (const fk of schema.foreignKeys) {
      if (fk.table === table) {
        needed.add(fk.column);
      }

      if (fk.parentTable === table) {
        needed.add(fk.parentColumn);
      }
    }

    counts[table] = await countRows(source, table);
    rows[table] = [];

    let seen = 0;

    for await (const batch of readTable(
      source,
      table,
      spec,
      batchFor(mapping, table, batchSize),
    )) {
      for (const row of batch) {
        const key = keyOf(spec.primaryKey, row);
        const values: RowRef["values"] = {};

        seen += 1;

        for (const column of spec.columns) {
          const value = row[column.name];
          const info = schema.columns.get(table)?.get(column.name);

          if (!info) {
            continue;
          }

          const problem = validateValue(column, value, info);

          if (problem) {
            flag(table, column.name, key, problem);
          }

          const allowed = schema.enumChecks.get(`${table}.${column.name}`);

          if (
            allowed &&
            typeof value === "string" &&
            !allowed.includes(value)
          ) {
            flag(
              table,
              column.name,
              key,
              `value "${value.slice(0, 40)}" is not one of: ${allowed.join(", ")}`,
            );
          }

          if (needed.has(column.name)) {
            values[column.name] = value as number | string | null;
          }

          if (column.kind === "blob" && Buffer.isBuffer(value)) {
            const id = `${table}.${column.name}`;
            const stats = blobColumns.get(id) ?? {
              table,
              column: column.name,
              rows: 0,
              bytes: 0,
              maxBytes: 0,
            };

            stats.rows += 1;
            stats.bytes += value.length;
            stats.maxBytes = Math.max(stats.maxBytes, value.length);
            blobColumns.set(id, stats);
          }

          if (
            /_hash$/.test(column.name) &&
            typeof value === "string" &&
            !SCRYPT_FORMAT.test(value)
          ) {
            const id = `${table}.${column.name}`;

            hashFormat.set(id, (hashFormat.get(id) ?? 0) + 1);
          }
        }

        rows[table].push({ key, values });
      }
    }

    if (seen !== counts[table]) {
      throw new Error(
        `${table}: read ${seen} rows but count(*) says ${counts[table]} (is the source changing?)`,
      );
    }

    log(`  read ${table}: ${counts[table]} rows`);
  }

  const byColumn = [...blobColumns.values()];
  const warnings = [...hashFormat].map(
    ([id, count]) =>
      `${id}: ${count} value(s) are not in the scrypt$N$salt$hash format (copied unchanged)`,
  );

  for (const blob of byColumn) {
    if (blob.maxBytes > BIG_BLOB_BYTES) {
      warnings.push(
        `${blob.table}.${blob.column}: largest blob is ${blob.maxBytes} bytes`,
      );
    }
  }

  return {
    counts,
    rows,
    invalid: [...invalid.values()],
    blobs: {
      total: {
        rows: byColumn.reduce((sum, blob) => sum + blob.rows, 0),
        bytes: byColumn.reduce((sum, blob) => sum + blob.bytes, 0),
      },
      byColumn,
    },
    warnings,
  };
};

const lookups = (resolution: OrphanResolution) => {
  const skipped = new Map(
    Object.entries(resolution.skipped).map(([table, keys]) => [
      table,
      new Set(keys),
    ]),
  );
  const nulled = new Map<string, Set<string>>();

  for (const [table, columns] of Object.entries(resolution.nulled)) {
    for (const [column, keys] of Object.entries(columns)) {
      nulled.set(`${table}.${column}`, new Set(keys));
    }
  }

  return {
    isSkipped: (table: string, key: string) =>
      skipped.get(table)?.has(key) === true,
    isNulled: (table: string, column: string, key: string) =>
      nulled.get(`${table}.${column}`)?.has(key) === true,
  };
};

type Lookups = ReturnType<typeof lookups>;

const loadTables = async (
  source: LibsqlClient,
  target: Client,
  mapping: TursoColumns,
  schema: TargetSchema,
  plan: LoadPlan,
  adjust: Lookups,
  batchSize: number,
  log: Log,
) => {
  const pending = new Map<string, { id: number; value: number }[]>();

  for (const table of plan.order) {
    const spec = mapping.tables[table];
    const extras = EXTRA_COLUMNS[table] ?? {};
    const insertColumns = [
      ...spec.columns.map((column) => column.name),
      ...Object.keys(extras),
    ];
    const deferred = new Set(
      plan.deferred.filter((fk) => fk.table === table).map((fk) => fk.column),
    );
    const identity = schema.identityTables.has(table);
    const perStatement = Math.min(
      batchFor(mapping, table, batchSize),
      Math.floor(MAX_PARAMS / insertColumns.length),
    );
    let loaded = 0;

    for await (const batch of readTable(
      source,
      table,
      spec,
      batchFor(mapping, table, batchSize),
    )) {
      const params: unknown[][] = [];

      for (const row of batch) {
        const key = keyOf(spec.primaryKey, row);

        if (adjust.isSkipped(table, key)) {
          continue;
        }

        const values = spec.columns.map((column) => {
          if (adjust.isNulled(table, column.name, key)) {
            return null;
          }

          if (deferred.has(column.name)) {
            const value = row[column.name];

            if (value !== null) {
              const id = `${table}.${column.name}`;
              const list = pending.get(id) ?? [];

              list.push({ id: Number(row.id), value: Number(value) });
              pending.set(id, list);
            }

            return null;
          }

          return toPgValue(column, row[column.name]);
        });

        params.push([...values, ...Object.values(extras)]);
      }

      for (let start = 0; start < params.length; start += perStatement) {
        const chunk = params.slice(start, start + perStatement);

        await target.query(
          buildInsert(table, insertColumns, chunk.length, identity),
          chunk.flat(),
        );
        loaded += chunk.length;
      }
    }

    log(`  loaded ${table}: ${loaded} rows`);
  }

  // Second step for the FK columns that closed a cycle (or point at the same
  // table): every parent row exists now.
  for (const fk of plan.deferred) {
    const list = pending.get(`${fk.table}.${fk.column}`) ?? [];
    const pk = mapping.tables[fk.table].primaryKey;

    if (pk.length !== 1 || pk[0] !== "id") {
      throw new Error(`Cannot defer ${fk.table}.${fk.column}: no id key`);
    }

    for (let start = 0; start < list.length; start += 5000) {
      const chunk = list.slice(start, start + 5000);

      await target.query(
        `UPDATE ${quote(fk.table)} AS t SET ${quote(fk.column)} = u.value
           FROM unnest($1::integer[], $2::integer[]) AS u(id, value)
          WHERE t.id = u.id`,
        [chunk.map((item) => item.id), chunk.map((item) => item.value)],
      );
    }

    log(`  set ${fk.table}.${fk.column}: ${list.length} values`);
  }
};

const readTarget = async function* (
  target: Client,
  table: string,
  columns: string[],
  order: string[],
  batchSize: number,
) {
  for (let offset = 0; ; offset += batchSize) {
    const result = await target.query(
      `SELECT ${columns.map(quote).join(", ")} FROM ${quote(table)} ORDER BY ${order.map(quote).join(", ")} LIMIT $1 OFFSET $2`,
      [batchSize, offset],
    );

    if (result.rows.length === 0) {
      return;
    }

    yield result.rows as Record<string, unknown>[];

    if (result.rows.length < batchSize) {
      return;
    }
  }
};

// Same checksum on both sides: per row a sha256 over normalized values, per
// table a sha256 over the sorted row hashes. Password hashes are text, so
// they are compared byte for byte.
const verifyTables = async (
  source: LibsqlClient,
  target: Client,
  mapping: TursoColumns,
  schema: TargetSchema,
  plan: LoadPlan,
  adjust: Lookups,
  counts: Record<string, number>,
  resolution: OrphanResolution,
  batchSize: number,
) => {
  const tables: Report["tables"] = [];

  for (const table of plan.order) {
    const spec = mapping.tables[table];
    const names = spec.columns.map((column) => column.name);
    const sourceHashes: string[] = [];
    const targetHashes: string[] = [];

    for await (const batch of readTable(
      source,
      table,
      spec,
      batchFor(mapping, table, batchSize),
    )) {
      for (const row of batch) {
        const key = keyOf(spec.primaryKey, row);

        if (adjust.isSkipped(table, key)) {
          continue;
        }

        sourceHashes.push(
          hashRow(
            spec.columns.map((column) =>
              adjust.isNulled(table, column.name, key)
                ? normalizeSource(column, null)
                : normalizeSource(column, row[column.name]),
            ),
          ),
        );
      }
    }

    for await (const batch of readTarget(
      target,
      table,
      names,
      spec.primaryKey,
      batchFor(mapping, table, batchSize),
    )) {
      for (const row of batch) {
        targetHashes.push(
          hashRow(
            spec.columns.map((column) =>
              normalizeTarget(column, row[column.name]),
            ),
          ),
        );
      }
    }

    const expectedRows =
      counts[table] - (resolution.skipped[table]?.length ?? 0);
    const sourceChecksum = tableChecksum(sourceHashes);
    const targetChecksum = tableChecksum(targetHashes);
    const notes: string[] = [];

    for (const [column, value] of Object.entries(EXTRA_COLUMNS[table] ?? {})) {
      const wrong = await target.query<{ n: string }>(
        `SELECT count(*) AS n FROM ${quote(table)} WHERE ${quote(column)} IS DISTINCT FROM $1`,
        [value],
      );

      if (Number(wrong.rows[0].n) > 0) {
        notes.push(
          `${column} is not ${String(value)} on ${wrong.rows[0].n} rows`,
        );
      }
    }

    tables.push({
      table,
      sourceRows: counts[table],
      expectedRows,
      targetRows: targetHashes.length,
      sourceChecksum,
      targetChecksum,
      match:
        targetHashes.length === expectedRows &&
        sourceHashes.length === expectedRows &&
        sourceChecksum === targetChecksum &&
        notes.length === 0,
      ...(notes.length > 0 ? { note: notes.join("; ") } : {}),
    });
  }

  const sequences = await checkSequences(
    target,
    plan.order.filter((table) => schema.identityTables.has(table)),
  );

  return { tables, sequences };
};

const printOrphans = (report: Report, log: Log) => {
  if (report.orphans.length === 0) {
    return;
  }

  log("\nOrphan report (rows whose parent row is missing):");
  log(
    formatTable(
      ["table", "column", "parent", "reason", "count", "sample ids"],
      report.orphans.map((group) => [
        group.table,
        group.column,
        group.parentTable,
        group.reason,
        String(group.count),
        group.sampleKeys.join(", "),
      ]),
    ),
  );
};

const printVerification = (report: Report, log: Log) => {
  log("\nVerification (rows and checksum, source vs PostgreSQL):");
  log(
    formatTable(
      ["table", "source", "expected", "target", "checksum", "result"],
      report.tables.map((row) => [
        row.table,
        String(row.sourceRows),
        String(row.expectedRows),
        String(row.targetRows ?? "-"),
        (row.targetChecksum ?? "-").slice(0, 12),
        row.match ? "ok" : `MISMATCH${row.note ? ` (${row.note})` : ""}`,
      ]),
    ),
  );

  const badSequences = report.sequences.filter((sequence) => !sequence.ok);

  for (const sequence of badSequences) {
    log(
      `SEQUENCE MISMATCH ${sequence.table}: next id would be ${sequence.next}, max id is ${sequence.maxId}`,
    );
  }
};

const isVerified = (report: Report) =>
  report.tables.length > 0 &&
  report.tables.every((table) => table.match) &&
  report.sequences.every((sequence) => sequence.ok);

const execute = async (options: RunOptions, report: Report, log: Log) => {
  const mapping = loadTursoColumns();
  const tableNames = Object.keys(mapping.tables).sort();
  const targetUrl = new URL(options.target);

  report.target = {
    host: targetUrl.host,
    database: targetUrl.pathname.replace(/^\//, ""),
  };

  if (isLocalFile(options.source)) {
    report.source = { kind: "file", host: null };
  } else {
    report.source = {
      kind: "remote",
      host: describeSourceHost(options.source),
    };
    if (!options.allowRemote) {
      throw new Abort(
        "Refusing a remote source: only file: SQLite copies are allowed. Pass --allow-remote to read a remote database (the runbook does not need it).",
      );
    }

    log(
      `WARNING: reading from the REMOTE database at ${report.source.host}. Rehearse on a local copy first.`,
    );
  }

  const source = openSource(options.source, options.authToken);
  const target = new Client({ connectionString: options.target, types: pgTypes });
  let inTransaction = false;

  try {
    await target.connect();
    log(`Target: ${report.target.host}/${report.target.database}`);

    const missing = await pendingMigrations(target);

    if (missing.length > 0) {
      throw new Abort(
        `The target has pending migrations (${missing.join(", ")}). Run "pnpm --filter @pt/api migrate" with DATABASE_URL set to the target first; this script never changes the schema.`,
      );
    }

    const schema = await introspectTarget(target, mapping);
    const problems = [
      ...(await checkSourceSchema(source, mapping)),
      ...schema.problems,
    ];

    if (problems.length > 0) {
      throw new Abort(`Schema mismatch:\n  - ${problems.join("\n  - ")}`);
    }

    const plan = planLoad(tableNames, schema.foreignKeys);

    report.loadOrder = plan.order;
    report.deferredColumns = plan.deferred.map(
      (fk) => `${fk.table}.${fk.column}`,
    );
    log(
      `Load order: ${plan.order.length} tables; deferred FK columns: ${report.deferredColumns.join(", ") || "none"}`,
    );

    log("\nReading and validating the source...");

    const analysis = await analyse(
      source,
      mapping,
      schema,
      options.batchSize,
      log,
    );

    report.invalidValues = analysis.invalid;
    report.blobs = analysis.blobs;
    report.warnings.push(...analysis.warnings);

    if (analysis.invalid.length > 0) {
      log("\nInvalid values (nothing was written):");
      log(
        formatTable(
          ["table", "column", "count", "first problem"],
          analysis.invalid.map((group) => [
            group.table,
            group.column,
            String(group.count),
            `${group.samples[0].key}: ${group.samples[0].problem}`,
          ]),
        ),
      );
      throw new Abort("The source has values PostgreSQL cannot accept");
    }

    const resolution = resolveOrphans(
      schema.foreignKeys,
      analysis.rows,
      options.orphans,
    );

    report.orphans = resolution.groups;
    report.skippedRows = Object.entries(resolution.skipped).map(
      ([table, keys]) => ({ table, keys }),
    );
    report.nulledValues = Object.entries(resolution.nulled).flatMap(
      ([table, columns]) =>
        Object.entries(columns).map(([column, keys]) => ({
          table,
          column,
          keys,
        })),
    );
    printOrphans(report, log);

    if (resolution.unnullable.length > 0) {
      report.orphans.push(...resolution.unnullable);
      throw new Abort(
        `--orphans=null cannot repair NOT NULL columns: ${resolution.unnullable
          .map((group) => `${group.table}.${group.column}`)
          .join(", ")}`,
      );
    }

    if (resolution.groups.length > 0 && options.orphans === "report") {
      throw new Abort(
        `The source has orphan rows (above). Nothing was written. Decide per table, then re-run with --orphans=skip or --orphans=null (verify needs the same flag).`,
      );
    }

    const skippedTotal = Object.values(resolution.skipped).reduce(
      (sum, keys) => sum + keys.length,
      0,
    );
    const nulledTotal = report.nulledValues.reduce(
      (sum, item) => sum + item.keys.length,
      0,
    );

    if (skippedTotal > 0 || nulledTotal > 0) {
      log(
        `Orphans resolved with --orphans=${options.orphans}: ${skippedTotal} rows skipped, ${nulledTotal} values set to NULL (all listed in the report).`,
      );
    }

    log(
      `Blobs: ${analysis.blobs.total.rows} values, ${analysis.blobs.total.bytes} bytes`,
    );

    const adjust = lookups(resolution);

    if (options.mode === "dry-run") {
      log("\nDry run: nothing was written.");
      report.status = "ok";
      return;
    }

    if (options.mode === "verify") {
      const result = await verifyTables(
        source,
        target,
        mapping,
        schema,
        plan,
        adjust,
        analysis.counts,
        resolution,
        options.batchSize,
      );

      report.tables = result.tables;
      report.sequences = result.sequences;
      printVerification(report, log);
      report.status = isVerified(report) ? "ok" : "failed";
      return;
    }

    if (!options.reset) {
      const filled = await tablesWithRows(target, tableNames);

      if (filled.length > 0) {
        throw new Abort(
          `The target already has rows (${filled.join(", ")}). Pass --reset to truncate the 44 tables and sessions first.`,
        );
      }
    }

    log("\nLoading in one transaction...");
    await target.query("BEGIN");
    inTransaction = true;

    if (options.reset) {
      // sessions references users and admins, so it goes in the same
      // statement; its rows belong to the old users anyway.
      await target.query(
        `TRUNCATE ${[...tableNames, "sessions"].map(quote).join(", ")} RESTART IDENTITY`,
      );
      log("Reset: truncated the 44 tables and sessions.");
    }

    await loadTables(
      source,
      target,
      mapping,
      schema,
      plan,
      adjust,
      options.batchSize,
      log,
    );
    await resetSequences(
      target,
      tableNames.filter((table) => schema.identityTables.has(table)),
    );

    // Proved before COMMIT: a mismatch rolls everything back.
    const result = await verifyTables(
      source,
      target,
      mapping,
      schema,
      plan,
      adjust,
      analysis.counts,
      resolution,
      options.batchSize,
    );

    report.tables = result.tables;
    report.sequences = result.sequences;
    printVerification(report, log);

    if (!isVerified(report)) {
      await target.query("ROLLBACK");
      inTransaction = false;
      report.status = "failed";
      report.errors.push("Verification failed; the load was rolled back");
      return;
    }

    await target.query("COMMIT");
    inTransaction = false;
    report.committed = true;
    report.status = "ok";
  } catch (error) {
    if (inTransaction) {
      await target.query("ROLLBACK").catch(() => undefined);
    }

    throw error;
  } finally {
    source.close();
    await target.end().catch(() => undefined);
  }
};

// Runs one migration, verification or dry run, prints a summary and (when asked)
// writes the JSON report. Never throws: the exit code says how it went.
export const run = async (
  options: RunOptions,
  log: Log = console.log,
): Promise<RunResult> => {
  const report = emptyReport(options.mode, {
    orphans: options.orphans,
    reset: options.reset,
    batchSize: options.batchSize,
  });
  const redact = makeRedactor([
    options.source,
    options.target,
    options.authToken,
  ]);
  const started = Date.now();

  try {
    await execute(options, report, log);
  } catch (error) {
    const message = redact(formatError(error));

    report.errors.push(message);
    report.status = error instanceof Abort ? "aborted" : "failed";
    log(`\n${error instanceof Abort ? "Aborted" : "Failed"}: ${message}`);
  }

  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;

  if (report.status === "ok") {
    log(
      `\nDone (${options.mode}) in ${report.durationMs} ms${report.committed ? ", committed" : ""}.`,
    );
  }

  if (options.reportPath) {
    writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    log(`Report written to ${options.reportPath}`);
  }

  return { exitCode: report.status === "ok" ? 0 : 1, report };
};
