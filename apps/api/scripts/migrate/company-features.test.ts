import { describe, expect, it } from "vitest";

import {
  COMPANY_REASONS,
  companyScanValues,
  findCompanyViolations,
  NULL_INSTEAD_OF_SKIP,
  repairCompanyRow,
} from "./company-features.js";
import type { RowRef } from "./plan.js";

const row = (key: string, values: RowRef["values"]): RowRef => ({
  key,
  values,
});

const found = (rows: Parameters<typeof findCompanyViolations>[0]) =>
  findCompanyViolations(rows)
    .map((v) => `${v.table}:${v.column}:${v.key}:${v.reason}`)
    .sort();

const message = (values: RowRef["values"]) => ({
  group_id: 1,
  kind: "message",
  sender_key: "user:1",
  hidden_by_key: null,
  hidden_at: null,
  reply_to_message_id: null,
  photo_id: null,
  ...values,
});

const photo = (values: RowRef["values"]) => ({
  group_id: 1,
  message_id: null,
  position: null,
  ...values,
});

describe("repairCompanyRow", () => {
  it("turns NULL managers_only and silent into false and leaves set values", () => {
    const group: Record<string, unknown> = { managers_only: null };
    const message: Record<string, unknown> = { silent: null };
    const loud: Record<string, unknown> = { silent: 1 };
    const other: Record<string, unknown> = { silent: null };

    repairCompanyRow("chat_groups", group);
    repairCompanyRow("chat_group_messages", message);
    repairCompanyRow("chat_group_messages", loud);
    repairCompanyRow("dm_messages", other);

    expect(group.managers_only).toBe(0);
    expect(message.silent).toBe(0);
    expect(loud.silent).toBe(1);
    expect(other.silent).toBeNull();
  });
});

describe("companyScanValues", () => {
  it("keeps the group name length in characters, never the name", () => {
    // Two emoji: 4 UTF-16 units, 2 characters (PostgreSQL char_length).
    expect(companyScanValues("chat_groups", { name: "😀😀" })).toEqual({
      name_length: 2,
    });
    expect(
      companyScanValues("chat_group_photos", { data: Buffer.from("a") }),
    ).toEqual({});
  });
});

describe("findCompanyViolations", () => {
  it("accepts rows that agree with every rule", () => {
    expect(
      found({
        users: [
          row("1", { accent_color: "#ff8800" }),
          row("2", { accent_color: null }),
        ],
        admins: [row("1", { accent_color: null })],
        theme_settings: [row("all", { accent: "#123abc" })],
        user_restrictions: [
          row("1", { lifted_at: 5, lifted_by_admin_id: 1 }),
          row("2", { lifted_at: null, lifted_by_admin_id: null }),
        ],
        chat_groups: [
          row("1", {
            name_length: 60,
            last_message_id: 2,
            dissolved_at: null,
            dissolved_by_admin_id: null,
          }),
        ],
        chat_group_members: [
          row("1|user:1", {
            left_at: 4,
            removed_by_key: "admin:1",
            last_read_message_id: 0,
          }),
        ],
        chat_group_messages: [
          row("1", message({ kind: "system", sender_key: null, photo_id: 7 })),
          row(
            "2",
            message({
              reply_to_message_id: 1,
              hidden_by_key: "admin:1",
              hidden_at: 9,
            }),
          ),
        ],
        chat_group_photos: [
          row("7", photo({ message_id: 1, position: 0 })),
          row("8", photo({ message_id: 1, position: 1 })),
          row("9", photo({})),
        ],
      }),
    ).toEqual([]);
  });

  it("flags colors that are not normalized #rrggbb", () => {
    expect(
      found({
        users: [row("1", { accent_color: "#FF8800" })],
        admins: [row("2", { accent_color: "#f80" })],
        theme_settings: [row("pt", { accent: "orange" })],
      }),
    ).toEqual([
      `admins:accent_color:2:${COMPANY_REASONS.accentFormat}`,
      `theme_settings:accent:pt:${COMPANY_REASONS.accentFormat}`,
      `users:accent_color:1:${COMPANY_REASONS.accentFormat}`,
    ]);
  });

  it("marks only the clearable rules nullable: personal colors and a restriction's lifted_by", () => {
    const nullable = findCompanyViolations({
      users: [row("1", { accent_color: "#FF8800" })],
      theme_settings: [row("pt", { accent: "cam" })],
      user_restrictions: [row("1", { lifted_at: null, lifted_by_admin_id: 3 })],
      chat_groups: [
        row("1", {
          name_length: 3,
          last_message_id: null,
          dissolved_at: null,
          dissolved_by_admin_id: 3,
        }),
      ],
    }).map((v) => `${v.table}:${v.column}:${v.nullable === true}`);

    expect(nullable.sort()).toEqual([
      "chat_groups:dissolved_by_admin_id:false",
      "theme_settings:accent:false",
      "user_restrictions:lifted_by_admin_id:true",
      "users:accent_color:true",
    ]);
    expect([...NULL_INSTEAD_OF_SKIP].sort()).toEqual([
      "user_restrictions.created_by_admin_id",
      "user_restrictions.lifted_by_admin_id",
    ]);
  });

  it("flags who-did-it columns without their timestamp", () => {
    expect(
      found({
        user_restrictions: [
          row("1", { lifted_at: null, lifted_by_admin_id: 3 }),
        ],
        chat_groups: [
          row("1", {
            name_length: 3,
            last_message_id: null,
            dissolved_at: null,
            dissolved_by_admin_id: 3,
          }),
        ],
        chat_group_members: [
          row("1|user:2", {
            left_at: null,
            removed_by_key: "admin:3",
            last_read_message_id: -1,
          }),
        ],
      }),
    ).toEqual([
      `chat_group_members:last_read_message_id:1|user:2:${COMPANY_REASONS.negativeLastRead}`,
      `chat_group_members:removed_by_key:1|user:2:${COMPANY_REASONS.removedWithoutLeftAt}`,
      `chat_groups:dissolved_by_admin_id:1:${COMPANY_REASONS.dissolvedByWithoutDissolvedAt}`,
      `user_restrictions:lifted_by_admin_id:1:${COMPANY_REASONS.liftedByWithoutLiftedAt}`,
    ]);
  });

  it("flags a name outside 1..60 characters and a last message of another group", () => {
    expect(
      found({
        chat_groups: [
          row("1", { name_length: 0, last_message_id: 5 }),
          row("2", { name_length: 61, last_message_id: null }),
        ],
        chat_group_messages: [row("5", message({ group_id: 2 }))],
      }),
    ).toEqual([
      `chat_groups:last_message_id:1:${COMPANY_REASONS.lastMessageOtherGroup}`,
      `chat_groups:name:1:${COMPANY_REASONS.nameLength}`,
      `chat_groups:name:2:${COMPANY_REASONS.nameLength}`,
    ]);
  });

  it("flags sender / kind, hidden pairs and cross-group replies", () => {
    expect(
      found({
        chat_group_messages: [
          row("1", message({ kind: "system" })),
          row("2", message({ sender_key: null })),
          row("3", message({ hidden_by_key: "admin:1", hidden_at: null })),
          row("4", message({ group_id: 2, reply_to_message_id: 3 })),
          row("5", message({ photo_id: 8 })),
        ],
        chat_group_photos: [row("8", photo({ message_id: 3 }))],
      }),
    ).toEqual([
      `chat_group_messages:hidden_by_key:3:${COMPANY_REASONS.hiddenPair}`,
      `chat_group_messages:reply_to_message_id:4:${COMPANY_REASONS.replyOtherGroup}`,
      `chat_group_messages:sender_key:1:${COMPANY_REASONS.senderKind}`,
      `chat_group_messages:sender_key:2:${COMPANY_REASONS.senderKind}`,
    ]);
  });

  it("flags a photo whose message is in another group (the cover and positions: chat-social.ts)", () => {
    expect(
      found({
        chat_group_messages: [row("1", message({ photo_id: 13 }))],
        chat_group_photos: [
          row("11", photo({ message_id: 1, position: 0 })),
          row("10", photo({ message_id: 1, position: 0 })),
          row("12", photo({ group_id: 2, message_id: 1, position: 1 })),
          row("13", photo({ position: -1 })),
        ],
      }),
    ).toEqual([
      `chat_group_photos:message_id:12:${COMPANY_REASONS.photoOtherGroup}`,
    ]);
  });
});
