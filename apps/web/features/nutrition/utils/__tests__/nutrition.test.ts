import { describe, expect, it } from "vitest";

import type {
  FoodEntry,
  NutritionDay,
  NutritionTarget,
} from "@/features/nutrition/types/nutrition";
import {
  calculateCalories,
  compareToTarget,
  getRingPercent,
  isDayOnTarget,
  summarizeNutritionWeek,
} from "@/features/nutrition/utils/nutrition";

const TARGET: NutritionTarget = {
  effectiveFrom: "2026-10-01",
  carbs: 200,
  protein: 150,
  fat: 50,
  note: "",
  source: "manual",
};

const createEntry = (
  carbs: number | null,
  protein: number | null,
  fat: number | null,
): FoodEntry => ({
  id: 1,
  date: "2026-10-05",
  meal: "lunch",
  description: "",
  carbs,
  protein,
  fat,
});

const createDay = (
  date: string,
  entries: FoodEntry[],
  target = TARGET,
): NutritionDay => {
  // What the API builds for a day of free-text entries only.
  const total = (key: "carbs" | "protein" | "fat") =>
    entries.reduce((sum, entry) => sum + (entry[key] ?? 0), 0);
  const totals = {
    carbs: total("carbs"),
    protein: total("protein"),
    fat: total("fat"),
  };

  return {
    date,
    target,
    entries,
    loggedCount: entries.length,
    totals,
    totalKcal: Math.round(calculateCalories(totals)),
  };
};

describe("compareToTarget", () => {
  it.each([
    // carbs and fat: ±10 g
    ["carbs", 100, 200, "under", 100],
    ["carbs", 190, 200, "on", 10],
    ["carbs", 189, 200, "under", 11],
    ["carbs", 210, 200, "on", 10],
    ["carbs", 211, 200, "over", 11],
    ["fat", 41, 50, "on", 9],
    ["fat", 61, 50, "over", 11],
    // protein: at most 5 g under, any amount over
    ["protein", 145, 150, "on", 5],
    ["protein", 144, 150, "under", 6],
    ["protein", 210, 150, "on", 60],
    // kcal: ±80
    ["kcal", 2420, 2500, "on", 80],
    ["kcal", 2419, 2500, "under", 81],
    ["kcal", 2580, 2500, "on", 80],
    ["kcal", 2581, 2500, "over", 81],
  ] as const)(
    "%s %s of a %s target is %s",
    (metric, actual, target, status, difference) => {
      expect(compareToTarget(actual, target, metric)).toMatchObject({
        status,
        difference,
      });
    },
  );

  it("reports no target", () => {
    expect(compareToTarget(100, 0, "carbs").status).toBe("none");
    expect(compareToTarget(100, undefined, "kcal").status).toBe("none");
  });
});

describe("week summary", () => {
  const onTarget = createDay("2026-10-05", [createEntry(200, 150, 50)]);
  const under = createDay("2026-10-06", [createEntry(100, 60, 20)]);
  const empty = createDay("2026-10-07", []);

  it("checks whether a day hit every target", () => {
    expect(isDayOnTarget(onTarget)).toBe(true);
    expect(isDayOnTarget(under)).toBe(false);
    expect(isDayOnTarget(empty)).toBe(false);
  });

  it("applies the kcal, protein and carbs/fat rules together", () => {
    // Target 200/150/50 = 800 + 600 + 450 = 1850 kcal.
    const day = (carbs: number, protein: number, fat: number) =>
      isDayOnTarget(
        createDay("2026-10-05", [createEntry(carbs, protein, fat)]),
      );

    // Each macro on its edge: 210/145/40 = 840 + 580 + 360 = 1780, 70 under.
    expect(day(210, 145, 40)).toBe(true);
    // Carbs 11 g over.
    expect(day(211, 150, 50)).toBe(false);
    // Protein 6 g under.
    expect(day(200, 144, 50)).toBe(false);
    // Protein far over is fine for protein, but kcal 2300 − 1850 = +450.
    expect(day(200, 260, 50)).toBe(false);
    // Macros each inside, kcal outside: 210/150/60 = 840 + 600 + 540 = 1980.
    expect(day(210, 150, 60)).toBe(false);
    // Fat 10 over alone (60) is a fat pass but kcal 1940 is 90 over.
    expect(day(200, 150, 60)).toBe(false);
  });

  it("averages over logged days only", () => {
    expect(summarizeNutritionWeek([onTarget, under, empty])).toEqual({
      loggedDays: 2,
      averages: { carbs: 150, protein: 105, fat: 35 },
      // (1850 + 820) / 2 days, from the counted kcal of each day.
      averageKcal: 1335,
      onTargetDays: 1,
    });
  });
});

describe("getRingPercent", () => {
  it("rounds the share of the target", () => {
    expect(getRingPercent(111, 160)).toBe(69);
    expect(getRingPercent(0, 160)).toBe(0);
  });

  it("clamps to 100 when the target is exceeded", () => {
    expect(getRingPercent(300, 160)).toBe(100);
    expect(getRingPercent(160, 160)).toBe(100);
  });

  it("is 0 without a usable target or amount", () => {
    expect(getRingPercent(50, undefined)).toBe(0);
    expect(getRingPercent(50, 0)).toBe(0);
    expect(getRingPercent(-5, 100)).toBe(0);
    expect(getRingPercent(Number.NaN, 100)).toBe(0);
  });
});
