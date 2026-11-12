import { describe, expect, it } from "vitest";

import {
  formatInboxTime,
  inboxPreviewPrefix,
} from "@/features/chat/utils/chat-inbox";

describe("inboxPreviewPrefix", () => {
  const fromAdmin = (id: number | null, name: string | null) => ({
    lastFromAdmin: true,
    lastSenderAdminId: id,
    lastSenderAdminName: name,
  });

  it("has no prefix when the trainee wrote last", () => {
    expect(
      inboxPreviewPrefix(
        {
          lastFromAdmin: false,
          lastSenderAdminId: null,
          lastSenderAdminName: null,
        },
        1,
      ),
    ).toBe("");
  });

  it("says Bạn when the viewing admin wrote last", () => {
    expect(inboxPreviewPrefix(fromAdmin(1, "Hoan"), 1)).toBe("Bạn: ");
  });

  it("names another admin", () => {
    expect(inboxPreviewPrefix(fromAdmin(2, "Minh"), 1)).toBe("Minh: ");
  });

  it("marks a deleted admin", () => {
    expect(inboxPreviewPrefix(fromAdmin(2, null), 1)).toBe("PT (đã xoá): ");
  });
});

describe("formatInboxTime", () => {
  // 2026-11-04 12:00 in Ho Chi Minh (UTC+7).
  const now = Date.parse("2026-11-04T05:00:00.000Z");
  const at = (iso: string) => Date.parse(iso);

  it("is empty without a message", () => {
    expect(formatInboxTime(null, now)).toBe("");
  });

  it("says Vừa xong under a minute, also for a clock skewed future time", () => {
    expect(formatInboxTime(now - 59_000, now)).toBe("Vừa xong");
    expect(formatInboxTime(now + 30_000, now)).toBe("Vừa xong");
  });

  it("counts minutes and hours within today", () => {
    expect(formatInboxTime(now - 60_000, now)).toBe("1 phút");
    expect(formatInboxTime(now - 59 * 60_000, now)).toBe("59 phút");
    expect(formatInboxTime(now - 60 * 60_000, now)).toBe("1 giờ");
    expect(formatInboxTime(at("2026-11-04T00:30:00.000Z"), now)).toBe("4 giờ");
  });

  it("uses the Ho Chi Minh day boundary for Hôm qua", () => {
    // 23:30 on the 3rd in Vietnam, 12.5 hours ago: yesterday, not "12 giờ".
    expect(formatInboxTime(at("2026-11-03T16:30:00.000Z"), now)).toBe(
      "Hôm qua",
    );
    // 00:30 on the 4th in Vietnam (17:30 UTC on the 3rd) is still today.
    expect(formatInboxTime(at("2026-11-03T17:30:00.000Z"), now)).toBe("11 giờ");
  });

  it("falls back to dd/MM from two days ago", () => {
    expect(formatInboxTime(at("2026-11-02T05:00:00.000Z"), now)).toBe("02/11");
    expect(formatInboxTime(at("2026-10-30T05:00:00.000Z"), now)).toBe("30/10");
  });
});
