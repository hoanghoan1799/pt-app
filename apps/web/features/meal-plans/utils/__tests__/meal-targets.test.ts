import { describe, expect, it } from "vitest";

import { splitDayTarget } from "@/features/meal-plans/utils/meal-targets";

// Worked example of the spec: P 160 / C 235 / F 55 g.
const DAY = { protein: 160, carbs: 235, fat: 55 };

describe("splitDayTarget", () => {
  it("splits equally over 4 meals when no share is set", () => {
    const result = splitDayTarget(DAY, [null, null, null, null]);

    // 160 / 4 = 40, 235 / 4 = 58.75 -> 59, 59, 59, 58, 55 / 4 = 13.75 -> 14, 14, 14, 13.
    expect(result).toEqual({
      ok: true,
      meals: [
        { protein: 40, carbs: 59, fat: 14, kcal: 40 * 4 + 59 * 4 + 14 * 9 },
        { protein: 40, carbs: 59, fat: 14, kcal: 40 * 4 + 59 * 4 + 14 * 9 },
        { protein: 40, carbs: 59, fat: 14, kcal: 40 * 4 + 59 * 4 + 14 * 9 },
        { protein: 40, carbs: 58, fat: 13, kcal: 40 * 4 + 58 * 4 + 13 * 9 },
      ],
    });
  });

  it("keeps the meals adding up to the day target exactly", () => {
    const result = splitDayTarget(DAY, [null, null, null]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 160 / 3 = 53.33 -> 54, 53, 53 (sum 160); 235 / 3 = 78.33 -> 79, 78, 78.
      expect(result.meals.map((meal) => meal.protein)).toEqual([54, 53, 53]);
      expect(result.meals.map((meal) => meal.carbs)).toEqual([79, 78, 78]);
      expect(result.meals.map((meal) => meal.fat)).toEqual([19, 18, 18]);
    }
  });

  it("splits by percent: 30 / 50 / 20 of P 160 C 235 F 55", () => {
    const result = splitDayTarget(DAY, [30, 50, 20]);

    // protein 48 / 80 / 32; carbs 70.5 / 117.5 / 47 -> 71 / 117 / 47 (sum 235);
    // fat 16.5 / 27.5 / 11 -> 17 / 27 / 11 (sum 55); remainders tie, earlier wins.
    expect(result).toEqual({
      ok: true,
      meals: [
        { protein: 48, carbs: 71, fat: 17, kcal: 192 + 284 + 153 },
        { protein: 80, carbs: 117, fat: 27, kcal: 320 + 468 + 243 },
        { protein: 32, carbs: 47, fat: 11, kcal: 128 + 188 + 99 },
      ],
    });
  });

  it("refuses shares that do not total 100", () => {
    expect(splitDayTarget(DAY, [30, 50, 30])).toEqual({
      ok: false,
      reason: "total",
    });
    expect(splitDayTarget(DAY, [30, 50, 10])).toEqual({
      ok: false,
      reason: "total",
    });
  });

  it("refuses a mix of set and unset shares, and zero or negative shares", () => {
    expect(splitDayTarget(DAY, [50, null, 50])).toEqual({
      ok: false,
      reason: "mixed",
    });
    expect(splitDayTarget(DAY, [100, 0])).toEqual({
      ok: false,
      reason: "range",
    });
    expect(splitDayTarget(DAY, [120, -20])).toEqual({
      ok: false,
      reason: "range",
    });
    expect(splitDayTarget(DAY, [Number.NaN, 100])).toEqual({
      ok: false,
      reason: "range",
    });
  });

  it("returns no meals for a day without meals", () => {
    expect(splitDayTarget(DAY, [])).toEqual({ ok: true, meals: [] });
  });

  it("gives one meal the whole day", () => {
    expect(splitDayTarget(DAY, [null])).toEqual({
      ok: true,
      meals: [{ ...DAY, kcal: 640 + 940 + 495 }],
    });
  });
});
