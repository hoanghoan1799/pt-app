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

    resolveOrphans(fks, data, "skip", [], new Set(["child.other_id"]));
    expect(JSON.stringify(data)).toBe(before);
  });

  it("skip clears a listed nullable foreign key instead of dropping the row, so its children stay", () => {
    const keep = new Set(["child.other_id"]);
    const result = resolveOrphans(fks, rows(), "skip", [], keep);

    // child 10 only had a dangling other_id: kept, other_id cleared.
    expect(result.nulled).toEqual({ child: { other_id: ["10"] } });
    // child 11 has a dangling NOT NULL parent_id: still dropped, with its child.
    expect(result.skipped).toEqual({ child: ["11"], grandchild: ["20"] });
    expect(
      result.groups.find((group) => group.column === "other_id"),
    ).toEqual(expect.objectContaining({ count: 1, sampleKeys: ["10"] }));
  });

  it("clears a nullable rule violation under null and skip, and only lists it under report", () => {
    const violation = {
      table: "child",
      column: "other_id",
      key: "10",
      reason: "some_rule",
      nullable: true,
    };
    const plain = { ...violation, key: "11", column: "parent_id", nullable: false };
    const data = (): Record<string, RowRef[]> => ({
      parent: rows().parent,
      child: [
        { key: "10", values: { id: 10, parent_id: 1, other_id: 1 } },
        { key: "11", values: { id: 11, parent_id: 2, other_id: null } },
      ],
    });

    const skip = resolveOrphans(fks, data(), "skip", [violation, plain]);
    const nulled = resolveOrphans(fks, data(), "null", [violation, plain]);
    const report = resolveOrphans(fks, data(), "report", [violation]);

    expect(skip.nulled).toEqual({ child: { other_id: ["10"] } });
    expect(skip.skipped).toEqual({ child: ["11"] });
    expect(nulled.nulled).toEqual({ child: { other_id: ["10"] } });
    expect(nulled.unnullable).toEqual([
      expect.objectContaining({ column: "parent_id", reason: "some_rule" }),
    ]);
    expect(report.nulled).toEqual({});
    expect(report.groups).toEqual([
      expect.objectContaining({ column: "other_id", reason: "some_rule" }),
    ]);
  });
});
