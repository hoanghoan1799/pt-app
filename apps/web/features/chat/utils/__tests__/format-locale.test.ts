import { describe, expect, it } from "vitest";

import {
  formatInboxTime,
  inboxPreviewPrefix,
} from "@/features/chat/utils/chat-inbox";
import {
  buildThreadItems,
  dayLabel,
  formatSentAt,
  quoteText,
  type ThreadMessage,
  unsentText,
} from "@/features/chat/utils/chat-thread-rules";
import { formatLastSeen } from "@/features/chat/utils/presence";
import {
  presenceView,
  shortLastSeen,
} from "@/features/chat/utils/presence-status";
import { stickerPreview } from "@/features/chat/utils/sticker-rules";

const TZ = "Asia/Ho_Chi_Minh";
// 2026-11-05 10:00 in Ho Chi Minh (UTC+7).
const NOW = new Date("2026-11-05T03:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("presence per locale", () => {
  it("words last seen in English", () => {
    expect(formatLastSeen(ago(30_000), NOW, TZ, "en")).toBe("Active now");
    expect(formatLastSeen(ago(5 * MINUTE), NOW, TZ, "en")).toBe(
      "Active 5 minutes ago",
    );
    expect(formatLastSeen(ago(HOUR), NOW, TZ, "en")).toBe("Active 1 hour ago");
    expect(formatLastSeen(ago(DAY), NOW, TZ, "en")).toBe("Active yesterday");
    expect(formatLastSeen(ago(3 * DAY), NOW, TZ, "en")).toBe("Active Nov 2");
    expect(formatLastSeen(ago(400 * DAY), NOW, TZ, "en")).toMatch(
      /^Active Oct \d+, 2025$/,
    );
    expect(formatLastSeen(ago(5 * MINUTE), NOW, TZ)).toBe(
      "Hoạt động 5 phút trước",
    );
  });

  it("drops the prefix in the short form and passes the locale through", () => {
    expect(shortLastSeen(ago(5 * MINUTE), NOW, "en")).toBe("5 minutes ago");
    expect(shortLastSeen(ago(5 * MINUTE), NOW)).toBe("5 phút trước");
    expect(presenceView(ago(5 * MINUTE), NOW, "en").text).toBe(
      "Active 5 minutes ago",
    );
  });
});

describe("inbox and thread text per locale", () => {
  it("formats the inbox time in English", () => {
    const nowMs = NOW.getTime();

    expect(formatInboxTime(nowMs - 10_000, nowMs, "en")).toBe("Just now");
    expect(formatInboxTime(nowMs - 5 * MINUTE, nowMs, "en")).toBe("5 min");
    expect(formatInboxTime(nowMs - 2 * HOUR, nowMs, "en")).toBe("2 h");
    expect(formatInboxTime(nowMs - DAY, nowMs, "en")).toBe("Yesterday");
    expect(formatInboxTime(nowMs - 5 * DAY, nowMs, "en")).toBe("Oct 31");
  });

  it("prefixes previews in English", () => {
    const item = {
      lastFromAdmin: true,
      lastSenderAdminId: 1,
      lastSenderAdminName: null,
    };

    expect(inboxPreviewPrefix(item, 1, "en")).toBe("You: ");
    expect(inboxPreviewPrefix(item, 2, "en")).toBe("PT (deleted): ");
    expect(inboxPreviewPrefix(item, 2)).toBe("PT (đã xoá): ");
  });

  it("words day labels, quotes and the sticker preview in English", () => {
    const nowMs = NOW.getTime();

    expect(dayLabel(NOW.toISOString(), nowMs, "en")).toBe("Today");
    expect(dayLabel(ago(DAY).toISOString(), nowMs, "en")).toBe("Yesterday");
    expect(dayLabel(ago(3 * DAY).toISOString(), nowMs, "en")).toBe("Nov 2");
    expect(formatSentAt("2026-11-05T03:42:00Z", "en")).toBe("10:42, Nov 5");
    expect(quoteText({ deleted: false, isSticker: true, body: "" }, "en")).toBe(
      "Sticker",
    );
    expect(quoteText({ deleted: true, body: "" }, "en")).toBe(
      "This message was unsent",
    );
    expect(unsentText("vi")).toBe("Tin nhắn đã bị thu hồi");
    expect(stickerPreview("en")).toBe("sent a sticker");
    expect(stickerPreview()).toBe("đã gửi một sticker");
  });

  it("marks the newest own message Sent or Seen in English", () => {
    const message = {
      id: 5,
      clientId: "c",
      senderRole: "user",
      senderAdminId: null,
      senderAdminName: null,
      body: "hi",
      createdAt: NOW.toISOString(),
    } as unknown as ThreadMessage;
    const status = (peerReadUpTo: number) =>
      buildThreadItems(
        [message],
        peerReadUpTo,
        NOW.getTime(),
        undefined,
        {},
        "en",
      ).flatMap((item) => (item.kind === "message" ? [item.statusLine] : []));

    expect(status(0)).toEqual(["Sent"]);
    expect(status(5)).toEqual(["Seen"]);
  });
});
