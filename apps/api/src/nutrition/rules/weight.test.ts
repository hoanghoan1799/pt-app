import { describe, expect, it } from "vitest";

import {
  getRecentWeekStarts,
  getWeightChanges,
  groupWeightsByWeek,
} from "./weight.js";

const WEEKS = getRecentWeekStarts("2026-10-05", 3);

describe("getRecentWeekStarts", () => {
  it("lists Mondays oldest first", () => {
    expect(WEEKS).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
  });
});

describe("groupWeightsByWeek", () => {
  it("averages each week and leaves gaps empty", () => {
    const weeks = groupWeightsByWeek(
      [
        { date: "2026-09-22", weightKg: 75 },
        { date: "2026-09-26", weightKg: 74.5 },
        { date: "2026-10-06", weightKg: 73.9 },
      ],
      WEEKS,
    );

    expect(weeks).toEqual([
      { weekStart: "2026-09-21", averageKg: 74.8, count: 2 },
      { weekStart: "2026-09-28", averageKg: null, count: 0 },
      { weekStart: "2026-10-05", averageKg: 73.9, count: 1 },
    ]);
  });
});

describe("getWeightChanges", () => {
  it("compares the last two weeks with data and the whole range", () => {
    expect(
      getWeightChanges([
        { weekStart: "a", averageKg: 75, count: 1 },
        { weekStart: "b", averageKg: null, count: 0 },
        { weekStart: "c", averageKg: 74.2, count: 2 },
        { weekStart: "d", averageKg: 74.5, count: 1 },
      ]),
    ).toEqual({ latest: 74.5, weekChange: 0.3, totalChange: -0.5 });
  });

  it("has no change with a single week", () => {
    expect(
      getWeightChanges([{ weekStart: "a", averageKg: 70, count: 1 }]),
    ).toEqual({
      latest: 70,
      weekChange: null,
      totalChange: null,
    });
  });
});
