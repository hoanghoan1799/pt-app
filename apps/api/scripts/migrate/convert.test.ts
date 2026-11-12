import { describe, expect, it } from "vitest";

import type { ColumnSpec } from "../turso-columns.js";
import {
  hashRow,
  normalizeSource,
  normalizeTarget,
  type SourceValue,
  tableChecksum,
  toPgValue,
  validateValue,
} from "./convert.js";
import { makeRedactor } from "./report.js";
import { parseCheckValues } from "./target.js";

const column = (kind: ColumnSpec["kind"]): ColumnSpec => ({
  name: "c",
  sqliteType: "integer",
  drizzleType: "x",
  kind,
  notNull: false,
  autoIncrement: false,
});
const pg = { dataType: "integer", nullable: true };

describe("conversion rules", () => {
  it("converts seconds and milliseconds timestamps, null stays null", () => {
    expect(toPgValue(column("timestamp_s"), 1_700_000_000)).toEqual(
      new Date(1_700_000_000_000),
    );
    expect(toPgValue(column("timestamp_ms"), 1_700_000_000_123)).toEqual(
      new Date(1_700_000_000_123),
    );
    expect(toPgValue(column("timestamp_s"), null)).toBeNull();
  });

  it("converts booleans and keeps blobs as Buffers", () => {
    expect(toPgValue(column("boolean"), 1)).toBe(true);
    expect(toPgValue(column("boolean"), 0)).toBe(false);

    const bytes = Buffer.from([0, 1, 2]);

    expect(toPgValue(column("blob"), bytes)).toBe(bytes);
  });

  it("rejects values PostgreSQL cannot hold", () => {
    expect(validateValue(column("boolean"), 2, pg)).toMatch(/not 0 or 1/);
    expect(validateValue(column("integer"), 1.5, pg)).toMatch(/integer/);
    expect(validateValue(column("integer"), 2 ** 40, pg)).toMatch(/32-bit/);
    expect(validateValue(column("timestamp_s"), 1.7e15, pg)).toMatch(/unit/);
    expect(validateValue(column("text"), "a\u0000b", pg)).toMatch(/NUL/);
    expect(
      validateValue(column("text"), null, { ...pg, nullable: false }),
    ).toBe("null in a NOT NULL column");
    expect(validateValue(column("real"), Number.NaN, pg)).toMatch(/finite/);
    expect(validateValue(column("blob"), "text", pg)).toMatch(/blob/);
    expect(validateValue(column("text"), "Đạt", pg)).toBeNull();
  });
});

describe("checksum tokens", () => {
  it("match between a SQLite value and the pg value it becomes", () => {
    const cases: [ColumnSpec["kind"], SourceValue, unknown][] = [
      ["timestamp_s", 1_700_000_000, new Date(1_700_000_000_000)],
      ["timestamp_ms", 1_700_000_000_123, new Date(1_700_000_000_123)],
      ["boolean", 1, true],
      ["real", 52.5, 52.5],
      ["integer", 7, 7],
      ["text", "Nguyễn Đạt", "Nguyễn Đạt"],
      ["blob", Buffer.from([0, 255, 1]), Buffer.from([0, 255, 1])],
    ];

    for (const [kind, source, target] of cases) {
      expect(normalizeSource(column(kind), source), kind).toBe(
        normalizeTarget(column(kind), target),
      );
    }
  });

  it("tells null from the text 'null' and a changed byte from the original", () => {
    expect(normalizeSource(column("text"), null)).not.toBe(
      normalizeSource(column("text"), "null"),
    );
    expect(normalizeSource(column("blob"), Buffer.from([1, 2]))).not.toBe(
      normalizeSource(column("blob"), Buffer.from([1, 3])),
    );
  });

  it("is independent of row order", () => {
    const a = hashRow(["i:1"]);
    const b = hashRow(["i:2"]);

    expect(tableChecksum([a, b])).toBe(tableChecksum([b, a]));
    expect(tableChecksum([a, b])).not.toBe(tableChecksum([a]));
  });
});

describe("helpers", () => {
  it("reads the values of a CHECK constraint as PostgreSQL prints it", () => {
    expect(
      parseCheckValues(
        "CHECK ((role = ANY (ARRAY['super_admin'::text, 'pt'::text])))",
      ),
    ).toEqual(["super_admin", "pt"]);
    expect(parseCheckValues(`CHECK (("x" IN ('a', 'b''c')))`)).toEqual([
      "a",
      "b'c",
    ]);
    expect(parseCheckValues("CHECK ((size > 0))")).toBeNull();
  });

  it("redacts connection strings, passwords and tokens", () => {
    const redact = makeRedactor([
      "postgres://pt:hunter2pass@db.example.com:5432/app",
      "libsql://x.turso.io?authToken=tok-abc-123",
      "sekret-token-value",
    ]);
    const text =
      "fail postgres://pt:hunter2pass@db.example.com:5432/app pw hunter2pass tok-abc-123 sekret-token-value";

    expect(redact(text)).not.toMatch(/hunter2pass|tok-abc-123|sekret/);
  });
});
