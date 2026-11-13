import { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";

import { buildDataSourceOptions } from "../../src/database/data-source-options.js";
import { DERIVED_IDS, deriveId, findViolations } from "./account-refs.js";
import { type ForeignKey, resolveOrphans, type RowRef } from "./plan.js";

describe("derived account ids", () => {
  it("cover exactly the generated columns of the entities", async () => {
    const dataSource = new DataSource(
      buildDataSourceOptions("postgres://pt:pw@localhost:1/none"),
    );

    await (
      dataSource as unknown as { buildMetadatas: () => Promise<void> }
    ).buildMetadatas();

    const generated = dataSource.entityMetadatas.flatMap((entity) =>
      entity.columns
        .filter((column) => column.generatedType === "STORED")
        .map((column) => `${entity.tableName}.${column.databaseName}`),
    );

    expect(Object.keys(DERIVED_IDS).sort()).toEqual(generated.sort());
  });

  it("extracts ids from keys and kind + id pairs like the SQL does", () => {
    expect(
      deriveId("social_comments", "author_user_id", { author_key: "user:12" }),
    ).toBe(12);
    expect(
      deriveId("social_comments", "author_admin_id", { author_key: "user:12" }),
    ).toBeNull();
    expect(
      deriveId("social_comments", "author_admin_id", { author_key: "admin:7" }),
    ).toBe(7);
    // Not account-shaped: no reference, nothing to check.
    for (const key of [
      "user:012",
      "user:abc",
      "user:",
      "user:1234567890",
      "pt",
      "user",
    ]) {
      expect(
        deriveId("social_comments", "author_user_id", { author_key: key }),
        key,
      ).toBeNull();
    }
    expect(
      deriveId("chat_reads", "reader_admin_id", { reader_key: "user" }),
    ).toBeNull();
    expect(
      deriveId("chat_reads", "reader_admin_id", { reader_key: "admin:3" }),
    ).toBe(3);
    expect(
      deriveId("social_posts", "author_user_id", {
        author_kind: "user",
        author_id: 5,
      }),
    ).toBe(5);
    expect(
      deriveId("social_posts", "author_admin_id", {
        author_kind: "user",
        author_id: 5,
      }),
    ).toBeNull();
    expect(
      deriveId("social_reports", "target_user_id", {
        target_kind: "post",
        target_id: 5,
      }),
    ).toBeNull();
  });
});

describe("constraint violations and derived foreign keys", () => {
  const rows: Record<string, RowRef[]> = {
    chat_messages: [
      { key: "1", values: { sender_role: "user", sender_admin_id: null } },
      { key: "2", values: { sender_role: "user", sender_admin_id: 4 } },
      { key: "3", values: { sender_role: "admin", sender_admin_id: 4 } },
      { key: "4", values: { sender_role: "admin", sender_admin_id: null } },
    ],
    chat_reactions: [{ key: "2:x", values: { message_id: 2 } }],
    users: [],
  };
  const fks: ForeignKey[] = [
    {
      table: "chat_reactions",
      column: "message_id",
      parentTable: "chat_messages",
      parentColumn: "id",
      nullable: false,
    },
  ];

  it("finds user messages that carry an admin id", () => {
    expect(findViolations(rows)).toEqual([
      {
        table: "chat_messages",
        column: "sender_admin_id",
        key: "2",
        reason: "user_message_with_admin",
      },
    ]);
  });

  it("skip drops the row and what pointed at it; report only lists; null refuses", () => {
    const violations = findViolations(rows);
    const withIds: Record<string, RowRef[]> = {
      ...rows,
      chat_messages: rows.chat_messages.map((row) => ({
        key: row.key,
        values: { ...row.values, id: Number(row.key) },
      })),
      chat_reactions: [{ key: "2:x", values: { message_id: 2 } }],
    };

    const skip = resolveOrphans(fks, withIds, "skip", violations);

    expect(skip.skipped).toEqual({
      chat_messages: ["2"],
      chat_reactions: ["2:x"],
    });

    const report = resolveOrphans(fks, withIds, "report", violations);

    expect(report.skipped).toEqual({});
    expect(report.groups.map((group) => group.reason)).toContain(
      "user_message_with_admin",
    );

    const nulled = resolveOrphans(fks, withIds, "null", violations);

    expect(nulled.unnullable.map((group) => group.reason)).toContain(
      "user_message_with_admin",
    );
  });

  it("never nulls a derived foreign key, even though the column is nullable", () => {
    const derived: ForeignKey = {
      table: "social_comments",
      column: "author_user_id",
      parentTable: "users",
      parentColumn: "id",
      nullable: true,
      derived: true,
    };
    const resolution = resolveOrphans(
      [derived],
      {
        social_comments: [{ key: "1", values: { author_user_id: 99 } }],
        users: [{ key: "1", values: { id: 1 } }],
      },
      "null",
    );

    expect(resolution.nulled).toEqual({});
    expect(resolution.unnullable).toHaveLength(1);
  });
});
