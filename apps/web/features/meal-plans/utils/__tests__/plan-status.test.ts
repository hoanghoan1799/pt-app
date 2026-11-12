import { describe, expect, it } from "vitest";

import type { PlanFood } from "@/features/meal-plans/types/meal-plan";
import {
  checkDayPlan,
  describeMealGaps,
  suggestFoodsForGap,
} from "@/features/meal-plans/utils/plan-status";

// Day target P 160 / C 235 / F 55 = 640 + 940 + 495 = 2075 kcal.
const TARGET = { protein: 160, carbs: 235, fat: 55 };

describe("checkDayPlan (S2 + R5)", () => {
  it("is on target at exactly the limits: protein -5, carbs +10, fat -10", () => {
    // P 155 (-5), C 245 (+10), F 45 (-10): kcal 620 + 980 + 405 = 2005, 70 under.
    const check = checkDayPlan(
      { protein: 155, carbs: 245, fat: 45 },
      TARGET,
      true,
    );

    expect(check.status).toBe("on");
    expect(check.comparisons?.kcal.status).toBe("on");
  });

  it("is off when protein is 6 g under, even though kcal match", () => {
    const check = checkDayPlan(
      { protein: 154, carbs: 235, fat: 55 },
      TARGET,
      true,
    );

    expect(check.status).toBe("off");
    expect(check.comparisons?.protein).toMatchObject({
      status: "under",
      difference: 6,
    });
    expect(check.comparisons?.kcal.status).toBe("on");
  });

  it("allows more protein than the target if kcal stay close", () => {
    // P +15 (60 kcal), F -5 (-45 kcal): kcal +15.
    const check = checkDayPlan(
      { protein: 175, carbs: 235, fat: 50 },
      TARGET,
      true,
    );

    expect(check.status).toBe("on");
  });

  it("is off when kcal are 81 over but every macro is within its range", () => {
    // C +10 (40 kcal) and F +5 (45 kcal) = +85 kcal.
    const check = checkDayPlan(
      { protein: 160, carbs: 245, fat: 60 },
      TARGET,
      true,
    );

    expect(check.comparisons?.carbs.status).toBe("on");
    expect(check.comparisons?.fat.status).toBe("on");
    expect(check.comparisons?.kcal).toMatchObject({
      status: "over",
      difference: 85,
    });
    expect(check.status).toBe("off");
  });

  it("is off when fat is 11 g over", () => {
    expect(
      checkDayPlan({ protein: 160, carbs: 235, fat: 66 }, TARGET, true).status,
    ).toBe("off");
  });

  it("has no verdict without foods or without a target", () => {
    expect(
      checkDayPlan({ protein: 0, carbs: 0, fat: 0 }, TARGET, false),
    ).toEqual({ status: "empty", comparisons: null });
    expect(
      checkDayPlan({ protein: 100, carbs: 100, fat: 10 }, null, true),
    ).toEqual({ status: "no-target", comparisons: null });
  });
});

describe("describeMealGaps", () => {
  it("reports what is short, biggest first, and ignores rounding leftovers", () => {
    expect(describeMealGaps({ protein: 0.7, carbs: 12.4, fat: 36.2 })).toEqual([
      { macro: "fat", kind: "short", grams: 36 },
      { macro: "carbs", kind: "short", grams: 12 },
    ]);
  });

  it("reports carbs or fat over the target, but never extra protein", () => {
    expect(describeMealGaps({ protein: -30, carbs: -7.4, fat: 4.4 })).toEqual([
      { macro: "carbs", kind: "over", grams: 7 },
    ]);
  });

  it("says nothing when the meal is within 5 g everywhere", () => {
    expect(describeMealGaps({ protein: 4, carbs: -4, fat: 0 })).toEqual([]);
  });
});

const food = (
  id: number,
  group: PlanFood["group"],
  macros: Partial<Record<"protein" | "carbs" | "fat", number>>,
  isArchived = false,
): PlanFood => ({
  id,
  name: `Food ${id}`,
  nameKey: `food ${id}`,
  group,
  state: null,
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  isArchived,
  ...macros,
});

describe("suggestFoodsForGap", () => {
  const library = [
    food(1, "meat", { protein: 31, fat: 3.6 }),
    food(2, "fat_oil", { fat: 100 }),
    food(3, "fat_oil", { fat: 81 }),
    food(4, "legume_nut", { protein: 21, fat: 50 }),
    food(5, "legume_nut", { protein: 5, fat: 5 }),
    food(6, "fat_oil", { fat: 99 }, true),
    food(7, "vegetable", { fat: 90 }),
  ];

  it("suggests the richest food of each fat group first, with the grams to close the gap", () => {
    const suggestions = suggestFoodsForGap("fat", 36, library);

    // Oil (100 g fat/100 g): 36 g -> 35 g. Nut (50 g/100 g): 72 g -> 70 g.
    // Third: next richest in the pool, the 81 g/100 g butter: 44.4 g -> 45 g.
    expect(suggestions.map(({ food: f, grams }) => [f.id, grams])).toEqual([
      [2, 35],
      [4, 70],
      [3, 45],
    ]);
  });

  it("skips archived foods, foods of other groups and foods already in the meal", () => {
    const ids = suggestFoodsForGap("fat", 20, library, [2]).map(
      ({ food: f }) => f.id,
    );

    expect(ids).not.toContain(6);
    expect(ids).not.toContain(7);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(1);
  });

  it("never suggests less than 5 g and respects the limit", () => {
    const suggestions = suggestFoodsForGap("fat", 1, library, [], 1);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].grams).toBe(5);
  });

  it("suggests protein foods for a protein gap", () => {
    const suggestions = suggestFoodsForGap("protein", 31, library);

    expect(suggestions[0].food.id).toBe(1);
    expect(suggestions[0].grams).toBe(100);
  });

  it("returns nothing when no food fits", () => {
    expect(suggestFoodsForGap("carbs", 30, library)).toEqual([]);
  });

  it("drops a suggestion that would need more than 3000 g", () => {
    // 1 g of protein per 100 g: a 40 g gap would need 4000 g.
    const weak = [food(1, "meat", { protein: 1 })];

    expect(suggestFoodsForGap("protein", 40, weak)).toEqual([]);
    expect(
      suggestFoodsForGap("protein", 30, weak).map(({ grams }) => grams),
    ).toEqual([3000]);
  });
});
