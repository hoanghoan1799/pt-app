import { describe, expect, it } from "vitest";

import {
  buildWeekCompletion,
  getDayCompletion,
} from "./day-completion.js";

describe("getDayCompletion", () => {
  it("is complete when every planned meal is marked", () => {
    expect(getDayCompletion([1, 2, 3], [3, 1, 2])).toBe("complete");
  });

  it("is partial when some but not all planned meals are marked", () => {
    expect(getDayCompletion([1, 2, 3], [2])).toBe("partial");
  });

  it("is none when nothing is marked", () => {
    expect(getDayCompletion([1, 2], [])).toBe("none");
  });

  it("is none for a day without a plan", () => {
    expect(getDayCompletion([], [])).toBe("none");
  });

  it("is none for a plan with no meals, even with stray marks", () => {
    expect(getDayCompletion([], [5])).toBe("none");
  });

  it("ignores marks of meals that are no longer in the plan", () => {
    expect(getDayCompletion([1, 2], [1, 99])).toBe("partial");
    expect(getDayCompletion([1, 2], [98, 99])).toBe("none");
    expect(getDayCompletion([1, 2], [1, 2, 99])).toBe("complete");
  });

  it("does not count a repeated mark twice", () => {
    expect(getDayCompletion([1, 2], [1, 1, 1])).toBe("partial");
  });
});

describe("buildWeekCompletion", () => {
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];

  it("returns one status per date, including past days and days without a plan", () => {
    const meals = new Map<string, number[]>([
      ["2026-11-02", [1, 2]], // past, all marked
      ["2026-11-03", [3, 4]], // past, one marked
      ["2026-11-04", [5]], // nothing marked
    ]);

    expect(buildWeekCompletion(dates, meals, [1, 2, 3])).toEqual({
      "2026-11-02": "complete",
      "2026-11-03": "partial",
      "2026-11-04": "none",
      "2026-11-05": "none",
    });
  });

  it("does not let a mark of one day count for another day", () => {
    const meals = new Map<string, number[]>([
      ["2026-11-02", [1]],
      ["2026-11-03", [2]],
    ]);

    expect(buildWeekCompletion(dates, meals, [1])).toMatchObject({
      "2026-11-02": "complete",
      "2026-11-03": "none",
    });
  });
});
