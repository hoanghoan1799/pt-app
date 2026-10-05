import { describe, expect, it } from "vitest";

import type {
  FoodEntry,
  NutritionDay,
  NutritionTarget,
} from "@/features/nutrition/types/nutrition";
import {
  compareToTarget,
  findTargetForDate,
  formatLang,
  isDayOnTarget,
  sumEntries,
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
): NutritionDay => ({
  date,
  target,
  entries,
  totals: sumEntries(entries),
});

describe("sumEntries", () => {
  it("treats missing macros as zero", () => {
    expect(
      sumEntries([createEntry(100, null, 10), createEntry(50, 80, null)]),
    ).toEqual({
      carbs: 150,
      protein: 80,
      fat: 10,
    });
  });
});

describe("findTargetForDate", () => {
  const later = { ...TARGET, effectiveFrom: "2026-10-08", carbs: 180 };

  it("uses the latest target that already started", () => {
    expect(findTargetForDate([TARGET, later], "2026-10-05")).toBe(TARGET);
    expect(findTargetForDate([TARGET, later], "2026-10-08")).toBe(later);
    expect(findTargetForDate([TARGET, later], "2026-09-30")).toBeNull();
  });
});

describe("compareToTarget", () => {
  it.each([
    [100, 200, "under", 100],
    [190, 200, "on", 10],
    [215, 200, "on", 15],
    [260, 200, "over", 60],
  ])("%s g of a %s g target is %s", (actual, target, status, difference) => {
    expect(compareToTarget(actual, target)).toMatchObject({
      status,
      difference,
    });
  });

  it("reports no target", () => {
    expect(compareToTarget(100, 0).status).toBe("none");
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

  it("averages over logged days only", () => {
    expect(summarizeNutritionWeek([onTarget, under, empty])).toEqual({
      loggedDays: 2,
      averages: { carbs: 150, protein: 105, fat: 35 },
      onTargetDays: 1,
    });
  });
});

describe("formatLang", () => {
  it("converts grams to lạng", () => {
    expect(formatLang(250)).toBe("2,5 lạng");
    expect(formatLang(100)).toBe("1 lạng");
  });
});
