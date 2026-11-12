import { describe, expect, it } from "vitest";

import {
  type ForeignKey,
  planLoad,
  resolveOrphans,
  type RowRef,
} from "./plan.js";

const fk = (
  table: string,
  column: string,
  parentTable: string,
  nullable = false,
): ForeignKey => ({
  table,
  column,
  parentTable,
  parentColumn: "id",
  nullable,
});

describe("planLoad", () => {
  it("orders parents before children", () => {
    const plan = planLoad(
      ["c", "b", "a"],
      [fk("c", "b_id", "b"), fk("b", "a_id", "a")],
    );

    expect(plan.order).toEqual(["a", "b", "c"]);
    expect(plan.deferred).toEqual([]);
  });

  it("defers self references", () => {
    const plan = planLoad(["m"], [fk("m", "reply_id", "m", true)]);

    expect(plan.order).toEqual(["m"]);
    expect(plan.deferred.map((d) => d.column)).toEqual(["reply_id"]);
  });

  it("breaks a cycle on a nullable column and keeps the NOT NULL edge", () => {
    const plan = planLoad(
      ["conversations", "messages"],
      [
        fk("conversations", "last_message_id", "messages", true),
        fk("messages", "conversation_id", "conversations"),
      ],
    );

    expect(plan.order).toEqual(["conversations", "messages"]);
    expect(plan.deferred).toEqual([
      expect.objectContaining({ column: "last_message_id" }),
    ]);
  });

  it("refuses a cycle with no nullable column", () => {
    expect(() =>
      planLoad(["a", "b"], [fk("a", "b_id", "b"), fk("b", "a_id", "a")]),
    ).toThrow(/Circular/);
  });
});

const fks = [
  fk("child", "parent_id", "parent"),
  fk("child", "other_id", "parent", true),
  fk("grandchild", "child_id", "child"),
];

const rows = (): Record<string, RowRef[]> => ({
  parent: [
    { key: "1", values: { id: 1 } },
    { key: "2", values: { id: 2 } },
  ],
  child: [
    { key: "10", values: { id: 10, parent_id: 1, other_id: 5 } },
    { key: "11", values: { id: 11, parent_id: 7, other_id: null } },
  ],
  grandchild: [{ key: "20", values: { child_id: 11 } }],
});

describe("resolveOrphans", () => {
  it("report lists every orphan and changes nothing", () => {
    const result = resolveOrphans(fks, rows(), "report");

    expect(result.groups).toEqual([
      expect.objectContaining({
        table: "child",
        column: "other_id",
        count: 1,
        sampleKeys: ["10"],
      }),
      expect.objectContaining({
        table: "child",
        column: "parent_id",
        count: 1,
        sampleKeys: ["11"],
      }),
    ]);
    expect(result.skipped).toEqual({});
  });

  it("skip drops the orphan rows and, in rounds, their children", () => {
    const result = resolveOrphans(fks, rows(), "skip");

    expect(result.skipped).toEqual({ child: ["10", "11"], grandchild: ["20"] });
    expect(result.groups.find((group) => group.table === "grandchild")).toEqual(
      expect.objectContaining({ reason: "parent_skipped", count: 1 }),
    );
  });

  it("null clears nullable columns and refuses NOT NULL ones", () => {
    const result = resolveOrphans(fks, rows(), "null");

    expect(result.nulled).toEqual({ child: { other_id: ["10"] } });
    expect(result.unnullable).toEqual([
      expect.objectContaining({ table: "child", column: "parent_id" }),
    ]);
  });

  it("does not modify the rows it is given", () => {
    const data = rows();
    const before = JSON.stringify(data);

    resolveOrphans(fks, data, "skip");
    expect(JSON.stringify(data)).toBe(before);
  });
});
