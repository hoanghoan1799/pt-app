import { describe, expect, it } from "vitest";

import {
  addDays,
  buildScheduleHref,
  formatFullDay,
  formatWeekRange,
  getRelativeWeekLabel,
  getTodayDate,
  getWeekDates,
  getWeekStart,
  isValidDate,
  resolveSchedule,
  shiftSchedule,
} from "@/features/workouts/utils/week";

describe("isValidDate", () => {
  it("accepts real dates only", () => {
    expect(isValidDate("2026-10-05")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("05/10/2026")).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });
});

describe("getTodayDate", () => {
  it("uses the given time zone, not UTC", () => {
    // 2026-10-05 20:00 UTC is already 06/10 in Vietnam.
    const now = new Date("2026-10-05T20:00:00Z");

    expect(getTodayDate("Asia/Ho_Chi_Minh", now)).toBe("2026-10-06");
  });
});

describe("week math", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("starts weeks on Monday", () => {
    expect(getWeekStart("2026-10-05")).toBe("2026-10-05");
    expect(getWeekStart("2026-10-11")).toBe("2026-10-05");
    expect(getWeekStart("2026-10-12")).toBe("2026-10-12");
  });

  it("lists seven dates", () => {
    expect(getWeekDates("2026-10-05")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });
});

describe("formatting", () => {
  it("formats ranges and full days in Vietnamese", () => {
    expect(formatWeekRange("2026-10-05")).toBe("05/10 – 11/10");
    expect(formatFullDay("2026-10-11")).toBe("Chủ Nhật, 11/10");
  });

  it("labels weeks relative to today", () => {
    expect(getRelativeWeekLabel("2026-10-05", "2026-10-07")).toBe("Tuần này");
    expect(getRelativeWeekLabel("2026-10-12", "2026-10-07")).toBe("Tuần sau");
    expect(getRelativeWeekLabel("2026-09-21", "2026-10-07")).toBe(
      "2 tuần trước",
    );
  });
});

describe("resolveSchedule", () => {
  const today = "2026-10-07";

  it("defaults to today in the current week", () => {
    expect(resolveSchedule({}, today)).toEqual({
      weekStart: "2026-10-05",
      selectedDate: today,
    });
  });

  it("selects Monday of another week", () => {
    expect(resolveSchedule({ week: "2026-10-14" }, today)).toEqual({
      weekStart: "2026-10-12",
      selectedDate: "2026-10-12",
    });
  });

  it("keeps a selected day inside the week", () => {
    expect(
      resolveSchedule({ week: "2026-10-12", day: "2026-10-15" }, today),
    ).toEqual({
      weekStart: "2026-10-12",
      selectedDate: "2026-10-15",
    });
  });

  it("ignores a selected day outside the week", () => {
    expect(
      resolveSchedule({ week: "2026-10-12", day: "2026-10-01" }, today),
    ).toEqual({
      weekStart: "2026-10-12",
      selectedDate: "2026-10-12",
    });
  });

  it("ignores invalid params", () => {
    expect(resolveSchedule({ week: "nope", day: "2026-13-01" }, today)).toEqual(
      {
        weekStart: "2026-10-05",
        selectedDate: today,
      },
    );
  });
});

describe("shiftSchedule", () => {
  it("keeps the weekday when moving weeks", () => {
    expect(shiftSchedule("2026-10-07", 1)).toEqual({
      weekStart: "2026-10-12",
      selectedDate: "2026-10-14",
    });
  });
});

describe("buildScheduleHref", () => {
  it("encodes the week and day", () => {
    expect(
      buildScheduleHref("/workouts", {
        weekStart: "2026-10-05",
        selectedDate: "2026-10-07",
      }),
    ).toBe("/workouts?week=2026-10-05&day=2026-10-07");
  });
});
