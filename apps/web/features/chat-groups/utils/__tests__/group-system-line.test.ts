import type { GroupSystemEvent } from "@pt/contracts";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { systemLineOf } from "@/features/chat-groups/utils/group-display";
import { MESSAGES } from "@/i18n/messages";
import { type Locale, LOCALES } from "@/utils/locale";

// System lines are stored as events and worded at read time in the reader's
// language (company G16): every event renders a full sentence with the names
// filled in, in vi, en and zh.

const names = {
  "admin:1": "Coach Dũng",
  "admin:2": "Coach Hà",
  "admin:3": "Boss",
  "user:5": "An",
  "user:6": "Bình",
};

const events: GroupSystemEvent[] = [
  {
    type: "member_added",
    actorKey: "admin:1",
    memberKeys: ["user:5", "user:6"],
  },
  { type: "member_removed", actorKey: "admin:1", memberKey: "user:5" },
  { type: "member_left", memberKey: "user:6" },
  { type: "renamed", actorKey: "admin:1", from: "Lớp A", to: "Lớp B" },
  { type: "avatar_changed", actorKey: "admin:1" },
  { type: "managers_only", actorKey: "admin:1", enabled: true },
  { type: "managers_only", actorKey: "admin:1", enabled: false },
  {
    type: "pt_changed",
    userId: 5,
    fromPtId: 1,
    toPtId: 2,
    resolution: null,
  },
  {
    type: "pt_changed",
    userId: 5,
    fromPtId: 1,
    toPtId: null,
    resolution: { choice: "keep", byAdminId: 3, at: 1 },
  },
  {
    type: "pt_changed",
    userId: 5,
    fromPtId: null,
    toPtId: 2,
    resolution: { choice: "remove", byAdminId: 3, at: 1 },
  },
  {
    type: "pt_changed",
    userId: 5,
    fromPtId: 1,
    toPtId: 2,
    resolution: { choice: "superseded", byAdminId: null, at: 1 },
  },
];

const render = (locale: Locale, event: GroupSystemEvent | null) => {
  const t = createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: "chatGroups",
  });
  const line = systemLineOf(event, names, {
    deletedMember: t("thread.deletedMember"),
    noPt: t("alert.noPt"),
  });

  return t(line.key as "systemLine.unknown", line.params);
};

describe("group system lines", () => {
  for (const locale of LOCALES) {
    it.each(events.map((event) => [event.type, event] as const))(
      `${locale}: words %s with the names filled in`,
      (_type, event) => {
        const text = render(locale, event);

        expect(text).not.toMatch(/[{}]/);
        expect(text).not.toContain("systemLine.");
        expect(text.length).toBeGreaterThan(5);
      },
    );
  }

  it("reads the Vietnamese sentences production shows", () => {
    expect(render("vi", events[0])).toBe(
      "Coach Dũng đã thêm An, Bình vào nhóm",
    );
    expect(render("vi", events[1])).toBe("Coach Dũng đã xoá An khỏi nhóm");
    expect(render("vi", events[2])).toBe("Bình đã rời nhóm");
    expect(render("vi", events[3])).toBe(
      'Coach Dũng đã đổi tên nhóm từ "Lớp A" thành "Lớp B"',
    );
    expect(render("vi", events[5])).toBe(
      "Coach Dũng đã bật chế độ chỉ quản lý được nhắn tin",
    );
    expect(render("vi", events[6])).toBe(
      "Coach Dũng đã cho mọi người nhắn tin",
    );
    expect(render("vi", events[7])).toBe(
      "PT của An đã đổi từ Coach Dũng sang Coach Hà.",
    );
    expect(render("vi", events[8])).toBe(
      "PT của An đã đổi từ Coach Dũng sang chưa có PT. Boss chọn giữ lại trong nhóm.",
    );
  });

  it("names a deleted account and an unreadable row in the reader's language", () => {
    expect(
      render("en", { type: "member_left", memberKey: "user:9" }),
    ).toContain(MESSAGES.en.chatGroups.thread.deletedMember);
    expect(render("vi", { type: "member_left", memberKey: "user:9" })).toBe(
      "Thành viên đã xoá đã rời nhóm",
    );
    expect(render("vi", null)).toBe("Cập nhật nhóm");
    expect(render("en", null)).toBe(MESSAGES.en.chatGroups.systemLine.unknown);
    expect(render("zh", null)).toBe(MESSAGES.zh.chatGroups.systemLine.unknown);
  });
});
