import { describe, expect, it } from "vitest";

import {
  formatDeletePlanQuestion,
  formatOverwriteLogWarning,
  formatOverwriteQuestion,
  getOverwriteDates,
} from "@/features/meal-plans/utils/overwrite-message";

describe("getOverwriteDates", () => {
  it("keeps only chosen dates that have a plan, sorted", () => {
    expect(
      getOverwriteDates(
        ["2026-10-29", "2026-10-28", "2026-10-27"],
        ["2026-10-27", "2026-10-29", "2026-11-02"],
      ),
    ).toEqual(["2026-10-27", "2026-10-29"]);
  });

  it("is empty when no chosen date has a plan", () => {
    expect(getOverwriteDates(["2026-10-28"], ["2026-10-27"])).toEqual([]);
  });
});

describe("formatOverwriteQuestion", () => {
  it("lists weekday and day/month", () => {
    // 2026-10-27 is a Tuesday, 2026-10-29 a Thursday.
    expect(formatOverwriteQuestion(["2026-10-27", "2026-10-29"])).toBe(
      "Ghi đè plan của T3 27/10, T5 29/10?",
    );
  });
});

describe("formatOverwriteLogWarning", () => {
  it("names only the overwritten days that have logs", () => {
    // 2026-10-27 Tue and 2026-10-29 Thu are overwritten; only Tuesday has logs.
    expect(
      formatOverwriteLogWarning(
        ["2026-10-27", "2026-10-29"],
        ["2026-10-27", "2026-10-28"],
      ),
    ).toBe("Học viên đã ghi bữa ăn ở T3 27/10; ghi đè sẽ xóa nhật ký đó.");
  });

  it("is null when no overwritten day has logs", () => {
    expect(
      formatOverwriteLogWarning(["2026-10-27"], ["2026-10-28"]),
    ).toBeNull();
    expect(formatOverwriteLogWarning([], ["2026-10-28"])).toBeNull();
  });
});

describe("formatDeletePlanQuestion", () => {
  it("warns about the logs only when the day has some", () => {
    expect(formatDeletePlanQuestion(false)).toBe("Xóa plan của ngày này?");
    expect(formatDeletePlanQuestion(true)).toContain("xóa nhật ký");
  });
});
