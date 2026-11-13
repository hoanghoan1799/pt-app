import type { DerivedCheck } from "./chat-social.js";
import type { Backfill, ViolationGroup } from "./constraints.js";
import type { OrphanGroup, OrphanMode } from "./plan.js";

export type TableReport = {
  table: string;
  sourceRows: number;
  // sourceRows minus the rows skipped for orphans.
  expectedRows: number;
  targetRows: number | null;
  sourceChecksum: string;
  targetChecksum: string | null;
  match: boolean;
  note?: string;
};

export type SequenceReport = {
  table: string;
  maxId: number | null;
  next: number;
  ok: boolean;
};

export type InvalidValueGroup = {
  table: string;
  column: string;
  count: number;
  samples: { key: string; problem: string }[];
};

export type BlobReport = {
  table: string;
  column: string;
  rows: number;
  bytes: number;
  maxBytes: number;
};

export type Report = {
  mode: "migrate" | "verify" | "dry-run";
  // ok: finished clean. aborted: stopped before writing (orphans, invalid
  // values, schema drift). failed: an error or a verification mismatch.
  status: "ok" | "aborted" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  source: { kind: "file" | "remote"; host: string | null };
  target: { host: string; database: string };
  options: { orphans: OrphanMode; reset: boolean; batchSize: number };
  committed: boolean;
  tables: TableReport[];
  // user_avatars / admin_avatars: users.avatar and admins.avatar decoded.
  avatars: TableReport[];
  // Unusable source avatars that were skipped (id, problem; never content).
  skippedAvatars: { table: string; id: string; problem: string }[];
  sequences: SequenceReport[];
  loadOrder: string[];
  deferredColumns: string[];
  orphans: OrphanGroup[];
  skippedRows: { table: string; keys: string[] }[];
  nulledValues: { table: string; column: string; keys: string[] }[];
  invalidValues: InvalidValueGroup[];
  // NULLs the db-constraints migration backfills, converted the same way.
  backfilledValues: Backfill[];
  // Rows that would break a new constraint (see cutover-runbook.md).
  constraintViolations: ViolationGroup[];
  blobs: { total: { rows: number; bytes: number }; byColumn: BlobReport[] };
  // Legacy source data PostgreSQL no longer has, dropped on request.
  droppedLegacy: { item: string; count: number }[];
  // Recomputed denormalised fields that differ (reported, never fixed).
  derivedChecks: DerivedCheck[];
  warnings: string[];
  errors: string[];
};

export const emptyReport = (
  mode: Report["mode"],
  options: Report["options"],
): Report => ({
  mode,
  status: "failed",
  startedAt: new Date().toISOString(),
  finishedAt: "",
  durationMs: 0,
  source: { kind: "file", host: null },
  target: { host: "", database: "" },
  options,
  committed: false,
  tables: [],
  avatars: [],
  skippedAvatars: [],
  sequences: [],
  loadOrder: [],
  deferredColumns: [],
  orphans: [],
  skippedRows: [],
  nulledValues: [],
  invalidValues: [],
  backfilledValues: [],
  constraintViolations: [],
  blobs: { total: { rows: 0, bytes: 0 }, byColumn: [] },
  droppedLegacy: [],
  derivedChecks: [],
  warnings: [],
  errors: [],
});

// Replaces every secret that could end up in a message (connection URLs and
// their parts, the auth token) before anything is printed or written.
export const makeRedactor = (secrets: (string | undefined)[]) => {
  const parts = new Set<string>();

  for (const secret of secrets) {
    if (!secret) {
      continue;
    }

    parts.add(secret);

    try {
      const url = new URL(secret);

      for (const part of [url.password, url.username]) {
        if (part.length > 2) {
          parts.add(decodeURIComponent(part));
          parts.add(part);
        }
      }

      const token = url.searchParams.get("authToken");

      if (token) {
        parts.add(token);
      }
    } catch {
      // Not a URL (the auth token): the whole value is redacted.
    }
  }

  const ordered = [...parts].sort((a, b) => b.length - a.length);

  return (text: string) => {
    let result = text;

    for (const part of ordered) {
      result = result.split(part).join("[redacted]");
    }

    return result;
  };
};

// Driver errors can carry values in `detail`; only the safe fields are kept.
export const formatError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "unknown error";
  }

  const pg = error as Error & {
    code?: string;
    table?: string;
    column?: string;
    constraint?: string;
  };
  const extra = [
    pg.code ? `code=${pg.code}` : "",
    pg.table ? `table=${pg.table}` : "",
    pg.column ? `column=${pg.column}` : "",
    pg.constraint ? `constraint=${pg.constraint}` : "",
  ].filter(Boolean);

  return extra.length > 0
    ? `${error.message} (${extra.join(", ")})`
    : error.message;
};

export const formatTable = (headers: string[], rows: string[][]) => {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  return [
    line(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(line),
  ].join("\n");
};
