import { createHash } from "node:crypto";

import type { ColumnSpec } from "../turso-columns.js";

// A value as read from SQLite (blobs already turned into Buffers).
export type SourceValue = null | number | string | Buffer;

export type PgColumnInfo = {
  dataType: string;
  nullable: boolean;
};

const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;
// Years 0001..9999: far wider than any real timestamp, narrower than what a
// JS Date and PostgreSQL both hold, so a unit mistake is caught.
const MIN_MS = Date.UTC(1, 0, 1);
const MAX_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

export const sha256Hex = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

// Describes a bad value without echoing its content (reports may be shared).
const describe = (value: SourceValue) =>
  Buffer.isBuffer(value)
    ? `blob of ${value.length} bytes`
    : typeof value === "string"
      ? `text of ${value.length} characters`
      : `${typeof value} ${String(value)}`;

// Returns the problem with `value`, or null when PostgreSQL will accept it.
// SQLite is dynamically typed, so every kind is checked, not trusted.
export const validateValue = (
  spec: ColumnSpec,
  value: SourceValue,
  pg: PgColumnInfo,
): string | null => {
  if (value === null) {
    return pg.nullable ? null : "null in a NOT NULL column";
  }

  switch (spec.kind) {
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return `not an integer: ${describe(value)}`;
      }

      return pg.dataType === "integer" && (value < INT4_MIN || value > INT4_MAX)
        ? "outside the 32-bit integer range"
        : null;
    case "boolean":
      return value === 0 || value === 1
        ? null
        : `not 0 or 1: ${describe(value)}`;
    case "timestamp_s":
    case "timestamp_ms": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return `not an integer timestamp: ${describe(value)}`;
      }

      const ms = spec.kind === "timestamp_s" ? value * 1000 : value;

      return ms < MIN_MS || ms > MAX_MS
        ? `timestamp outside years 0001-9999 (unit mistake?): ${value}`
        : null;
    }
    case "real":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `not a finite number: ${describe(value)}`;
    case "text":
    case "json":
      if (typeof value !== "string") {
        return `not text: ${describe(value)}`;
      }

      return value.includes("\u0000")
        ? "text contains a NUL character, which PostgreSQL cannot store"
        : null;
    case "blob":
      return Buffer.isBuffer(value) ? null : `not a blob: ${describe(value)}`;
  }
};

// SQLite value -> the parameter handed to pg. Only call after validateValue.
export const toPgValue = (spec: ColumnSpec, value: SourceValue): unknown => {
  if (value === null) {
    return null;
  }

  switch (spec.kind) {
    case "boolean":
      return value === 1;
    case "timestamp_s":
      return new Date((value as number) * 1000);
    case "timestamp_ms":
      return new Date(value as number);
    default:
      return value;
  }
};

// The checksum tokens. Each side derives them on its own path (never from the
// converted value), so a conversion bug shows up as a mismatch:
// timestamps -> epoch ms, booleans -> 0/1, blobs -> sha256, text as is.
const NULL_TOKEN = "~";

export const normalizeSource = (
  spec: ColumnSpec,
  value: SourceValue,
): string => {
  if (value === null) {
    return NULL_TOKEN;
  }

  switch (spec.kind) {
    case "integer":
      return `i:${value as number}`;
    case "boolean":
      return `b:${value as number}`;
    case "timestamp_s":
      return `m:${(value as number) * 1000}`;
    case "timestamp_ms":
      return `m:${value as number}`;
    case "real":
      return `r:${value as number}`;
    case "blob":
      return `x:${sha256Hex(value as Buffer)}`;
    default:
      return `t:${value as string}`;
  }
};

// A value as returned by the pg driver for the column's PostgreSQL type.
export const normalizeTarget = (spec: ColumnSpec, value: unknown): string => {
  if (value === null || value === undefined) {
    return NULL_TOKEN;
  }

  switch (spec.kind) {
    case "integer":
      return `i:${Number(value)}`;
    case "boolean":
      return `b:${value ? 1 : 0}`;
    case "timestamp_s":
    case "timestamp_ms":
      return `m:${(value as Date).getTime()}`;
    case "real":
      return `r:${Number(value)}`;
    case "blob":
      return `x:${sha256Hex(value as Buffer)}`;
    default:
      return `t:${value as string}`;
  }
};

export const hashRow = (tokens: string[]) => sha256Hex(JSON.stringify(tokens));

// Order-independent: the row hashes are sorted before the final hash.
export const tableChecksum = (rowHashes: string[]) =>
  sha256Hex([...rowHashes].sort().join("\n"));
