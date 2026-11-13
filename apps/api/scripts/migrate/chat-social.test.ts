import { describe, expect, it } from "vitest";

import { loadTursoColumns } from "../turso-columns.js";
import {
  findChatSocialViolations,
  legacyProblems,
  repairSourceRow,
  withoutLegacy,
} from "./chat-social.js";
import type { RowRef } from "./plan.js";

const row = (key: string, values: RowRef["values"]): RowRef => ({
  key,
  values,
});

describe("withoutLegacy", () => {
  it("removes the dropped table and columns and nothing else", () => {
    const full = loadTursoColumns();
    const reduced = withoutLegacy(full);

    expect(Object.keys(full.tables)).toContain("chat_nicknames");
    expect(Object.keys(reduced.tables)).not.toContain("chat_nicknames");
    expect(Object.keys(reduced.tables)).toHaveLength(
      Object.keys(full.tables).length - 1,
    );

    const names = reduced.tables.chat_messages.columns.map((c) => c.name);

    expect(names).not.toContain("attachment_url");
    expect(names).not.toContain("attachment_meta");
    expect(names).toContain("sticker_url");
    expect(names).toHaveLength(
      full.tables.chat_messages.columns.length - 2,
    );
  });
});

describe("legacyProblems", () => {
  it("blocks per kind until its flag is given", () => {
    const counts = { attachments: 2, nicknames: 3 };

    expect(legacyProblems(counts, {})).toHaveLength(2);
    expect(legacyProblems(counts, { attachments: true })).toHaveLength(1);
    expect(
      legacyProblems(counts, { attachments: true, nicknames: true }),
    ).toEqual([]);
    expect(legacyProblems({ attachments: 0, nicknames: 0 }, {})).toEqual([]);
  });
});

describe("repairSourceRow", () => {
  it("turns a NULL silent into 0 and leaves other values", () => {
    const nullSilent: Record<string, unknown> = { silent: null };
    const set: Record<string, unknown> = { silent: 1 };

    repairSourceRow("chat_messages", nullSilent);
    repairSourceRow("chat_messages", set);
    repairSourceRow("dm_messages", { silent: null });
    expect(nullSilent.silent).toBe(0);
    expect(set.silent).toBe(1);
  });
});

describe("findChatSocialViolations", () => {
  it("accepts agreeing links and pairs", () => {
    expect(
      findChatSocialViolations({
        chat_messages: [
          row("1", { conversation_id: 1, reply_to_message_id: null, photo_id: 7 }),
          row("2", { conversation_id: 1, reply_to_message_id: 1, photo_id: null }),
        ],
        chat_photos: [row("7", { message_id: 1, size: 3, data_length: 3 })],
        chat_conversations: [row("1", { last_message_id: 2 })],
        social_friendships: [
          row("1:2", { user_low: 1, user_high: 2, requested_by: 2 }),
        ],
      }),
    ).toEqual([]);
  });

  it("flags a photo that names a message pointing at another photo, from both sides", () => {
    const found = findChatSocialViolations({
      chat_messages: [
        row("1", { conversation_id: 1, reply_to_message_id: null, photo_id: 8 }),
      ],
      chat_photos: [
        row("7", { message_id: 1, size: 3, data_length: 3 }),
        row("8", { message_id: 2, size: 3, data_length: 3 }),
      ],
    });

    expect(found.map((v) => `${v.table}:${v.column}:${v.key}`).sort()).toEqual([
      "chat_messages:photo_id:1",
      "chat_photos:message_id:7",
    ]);
  });

  it("keeps the first open report and flags the later duplicates", () => {
    const open = { status: "open", resolution: null, resolved_at: null, resolved_by: null };
    const found = findChatSocialViolations({
      social_reports: [
        row("10", { ...open, reporter_key: "user:1", target_kind: "post", target_id: 4 }),
        row("9", { ...open, reporter_key: "user:1", target_kind: "post", target_id: 4 }),
        row("11", { ...open, reporter_key: "user:1", target_kind: "comment", target_id: 4 }),
      ],
    });

    expect(found.map((v) => v.key)).toEqual(["10"]);
  });
});
