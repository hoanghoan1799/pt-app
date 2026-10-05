import { describe, expect, it } from "vitest";

import {
  findNearestPoint,
  formatWeightChange,
  getRecentWeekStarts,
  getWeightChanges,
  getWeightTicks,
  groupWeightsByWeek,
  toChartPoints,
} from "@/features/nutrition/utils/weight";

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

describe("getWeightTicks", () => {
  it("picks a clean step covering the data", () => {
    const ticks = getWeightTicks([73.9, 74.8, 75.6]);

    expect(ticks[0]).toBeLessThanOrEqual(73.9);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(75.6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks).toEqual([73.5, 74, 74.5, 75, 75.5, 76]);
  });

  it("widens the step for a large range", () => {
    expect(getWeightTicks([60, 75])).toEqual([55, 60, 65, 70, 75, 80]);
  });

  it("handles a single value", () => {
    expect(getWeightTicks([70])).toEqual([69.5, 70, 70.5]);
  });
});

describe("chart geometry", () => {
  const area = { left: 0, right: 100, top: 0, bottom: 50 };
  const points = toChartPoints(
    [
      { weekStart: "a", averageKg: 70, count: 1 },
      { weekStart: "b", averageKg: null, count: 0 },
      { weekStart: "c", averageKg: 72, count: 1 },
    ],
    [70, 71, 72],
    area,
  );

  it("maps values onto the plot area and skips empty weeks", () => {
    expect(points).toEqual([
      { index: 0, x: 0, y: 50, value: 70 },
      { index: 2, x: 100, y: 0, value: 72 },
    ]);
  });

  it("snaps to the nearest point", () => {
    expect(findNearestPoint(points, 60)?.index).toBe(2);
    expect(findNearestPoint([], 60)).toBeNull();
  });
});

describe("formatWeightChange", () => {
  it("signs the change", () => {
    expect(formatWeightChange(0.4)).toBe("+0,4 kg");
    expect(formatWeightChange(-1.2)).toBe("−1,2 kg");
    expect(formatWeightChange(0)).toBe("0 kg");
  });
});
