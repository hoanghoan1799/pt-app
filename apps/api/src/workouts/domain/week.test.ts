import { describe, expect, it } from "vitest";

import {
  eachDate,
  getTodayDate,
  getWeekDates,
  getWeekdayIndex,
  getWeekStart,
} from "./week.js";

describe("getTodayDate", () => {
  it("uses the time zone, not UTC", () => {
    // 20:00 UTC on the 12th is already the 13th in Ho Chi Minh (UTC+7).
    const now = new Date("2026-11-12T20:00:00Z");

    expect(getTodayDate("Asia/Ho_Chi_Minh", now)).toBe("2026-11-13");
    expect(getTodayDate("UTC", now)).toBe("2026-11-12");
  });
});

describe("weeks start on Monday", () => {
  it("maps weekdays to Monday = 0 ... Sunday = 6", () => {
    expect(getWeekdayIndex("2026-11-09")).toBe(0);
    expect(getWeekdayIndex("2026-11-15")).toBe(6);
  });

  it("snaps any date to its Monday, across a month and a year", () => {
    expect(getWeekStart("2026-11-12")).toBe("2026-11-09");
    expect(getWeekStart("2026-11-15")).toBe("2026-11-09");
    expect(getWeekStart("2026-11-09")).toBe("2026-11-09");
    expect(getWeekStart("2027-01-01")).toBe("2026-12-28");
  });

  it("lists the seven dates of a week", () => {
    expect(getWeekDates("2026-11-09")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });
});

describe("eachDate", () => {
  it("includes both ends", () => {
    expect(eachDate("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
    expect(eachDate("2026-11-09", "2026-11-09")).toEqual(["2026-11-09"]);
  });
});
