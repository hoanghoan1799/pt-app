import {
  getTodayDate,
  getWeekDates,
  getWeekdayIndex,
  getWeekStart,
  VIETNAM_TIME_ZONE,
} from "../week.js";
import { describe, expect, it } from "vitest";

describe("week utilities", () => {
  it("numbers the weekdays from Monday = 0 to Sunday = 6", () => {
    expect(getWeekdayIndex("2026-11-09")).toBe(0);
    expect(getWeekdayIndex("2026-11-12")).toBe(3);
    expect(getWeekdayIndex("2026-11-15")).toBe(6);
  });

  it("snaps any date to its Monday, across month and year boundaries", () => {
    expect(getWeekStart("2026-11-15")).toBe("2026-11-09");
    expect(getWeekStart("2026-11-09")).toBe("2026-11-09");
    expect(getWeekStart("2026-11-01")).toBe("2026-10-26");
    expect(getWeekStart("2027-01-01")).toBe("2026-12-28");
  });

  it("lists the seven dates of a week", () => {
    expect(getWeekDates("2026-10-26")).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29",
      "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
  });

  it("reads 'today' in Vietnam time, not UTC", () => {
    // 20:00 UTC on the 12th is already 03:00 on the 13th in Vietnam.
    expect(getTodayDate(VIETNAM_TIME_ZONE, new Date("2026-11-12T20:00:00Z"))).toBe("2026-11-13");
    expect(getTodayDate(VIETNAM_TIME_ZONE, new Date("2026-11-12T10:00:00Z"))).toBe("2026-11-12");
  });
});
