import { describe, expect, it } from "vitest";

import { formatMonthLabel } from "@/utils/month";
import {
  calculatePercent,
  formatClockTime,
  formatRelativeTime,
  formatShortDate,
  formatShortDateTime,
} from "@/utils/time";
import {
  formatDayMonth,
  formatFullDay,
  formatWeekRange,
  formatWeekTitle,
  getWeekdayLabel,
  getWeekdayShortLabel,
  getWeekdayShortLabels,
} from "@/utils/week";

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const NOW = Date.parse("2026-10-05T12:00:00Z");

describe("week formatting per locale", () => {
  it("keeps Vietnamese as the default", () => {
    expect(formatFullDay("2026-11-02")).toBe(formatFullDay("2026-11-02", "vi"));
    expect(formatFullDay("2026-11-02", "vi")).toBe("Thứ Hai, 02/11");
    expect(getWeekdayShortLabels("vi")).toEqual([
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "CN",
    ]);
  });

  it("names weekdays and days in English", () => {
    expect(getWeekdayLabel("2026-11-08", "en")).toBe("Sunday");
    expect(getWeekdayShortLabel("2026-11-02", "en")).toBe("Mon");
    expect(formatDayMonth("2026-11-02", "en")).toBe("Nov 2");
    expect(formatFullDay("2026-11-02", "en")).toBe("Monday, Nov 2");
    expect(formatWeekRange("2026-11-02", "en")).toBe("Nov 2 – Nov 8");
  });

  it("titles a week in English for each month and year span", () => {
    expect(formatWeekTitle("2026-11-02", "en")).toBe("Nov 2–8, 2026");
    expect(formatWeekTitle("2026-10-26", "en")).toBe("Oct 26 – Nov 1, 2026");
    expect(formatWeekTitle("2026-12-28", "en")).toBe(
      "Dec 28, 2026 – Jan 3, 2027",
    );
  });

  it("labels a month in English", () => {
    expect(formatMonthLabel("2026-11", "vi")).toBe("Tháng 11, 2026");
    expect(formatMonthLabel("2026-11", "en")).toBe("November 2026");
  });
});

describe("time formatting per locale", () => {
  it("formats the clock and short date in English", () => {
    const at = Date.parse("2026-10-05T11:30:00Z");

    expect(formatClockTime(at, TIME_ZONE, "en")).toBe("18:30");
    expect(formatShortDate(at, TIME_ZONE, "en")).toBe("Oct 5");
    expect(formatShortDateTime(at, TIME_ZONE, "en")).toBe("Oct 5 18:30");
  });

  it.each([
    [NOW - 20 * 1000, "just now"],
    [NOW - 60 * 1000, "1 minute ago"],
    [NOW - 5 * 60 * 1000, "5 minutes ago"],
    [NOW - 3 * 60 * 60 * 1000, "3 hours ago"],
    [NOW - 24 * 60 * 60 * 1000, "1 day ago"],
    [Date.parse("2026-09-20T05:00:00Z"), "Sep 20"],
  ])("formats %s as %s in English", (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, TIME_ZONE, NOW, "en")).toBe(expected);
  });

  it("still calculates percents", () => {
    expect(calculatePercent(1, 4)).toBe(25);
  });
});
