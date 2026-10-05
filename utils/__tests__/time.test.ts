import { describe, expect, it } from "vitest";

import {
  calculatePercent,
  formatClockTime,
  formatRelativeTime,
  formatShortDate,
} from "@/utils/time";

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const NOW = Date.parse("2026-10-05T12:00:00Z"); // 19:00 in Vietnam

describe("formatClockTime", () => {
  it("uses the given time zone", () => {
    expect(formatClockTime(Date.parse("2026-10-05T11:30:00Z"), TIME_ZONE)).toBe(
      "18:30",
    );
  });
});

describe("formatShortDate", () => {
  it("rolls over to the next day in Vietnam", () => {
    expect(formatShortDate(Date.parse("2026-10-05T20:00:00Z"), TIME_ZONE)).toBe(
      "06/10",
    );
  });
});

describe("formatRelativeTime", () => {
  it.each([
    [NOW - 20 * 1000, "vừa xong"],
    [NOW - 5 * 60 * 1000, "5 phút trước"],
    [NOW - 3 * 60 * 60 * 1000, "3 giờ trước"],
    [NOW - 2 * 24 * 60 * 60 * 1000, "2 ngày trước"],
    [Date.parse("2026-09-20T05:00:00Z"), "20/09"],
  ])("formats %s as %s", (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, TIME_ZONE, NOW)).toBe(expected);
  });
});

describe("calculatePercent", () => {
  it("rounds and handles zero totals", () => {
    expect(calculatePercent(2, 3)).toBe(67);
    expect(calculatePercent(0, 0)).toBe(0);
  });
});
