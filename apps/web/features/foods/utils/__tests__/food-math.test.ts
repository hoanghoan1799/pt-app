import { kcalFromMacros, kcalGap } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  formatGrams,
  macroSplit,
  scaleFood,
  servingsToGrams,
} from "@/features/foods/utils/food-math";

// Chicken breast, cooked, per 100 g.
const CHICKEN = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
// A bowl of pho per 100 g with a 500 g serving.
const PHO = { kcal: 60, protein: 4, carbs: 8, fat: 1.2 };

describe("F1 scaleFood", () => {
  it("gives 248 kcal, P 46.5, C 0, F 5.4 for 150 g of chicken breast", () => {
    // 165 × 1.5 = 247.5 -> 248; 31 × 1.5 = 46.5; 3.6 × 1.5 = 5.4.
    expect(scaleFood(CHICKEN, 150)).toEqual({
      grams: 150,
      kcal: 248,
      protein: 46.5,
      carbs: 0,
      fat: 5.4,
    });
  });

  it("returns the per 100 g values for exactly 100 g", () => {
    expect(scaleFood(CHICKEN, 100)).toEqual({
      grams: 100,
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
    });
  });

  it("treats empty, negative and non-numeric amounts as zero", () => {
    const zero = { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 };

    expect(scaleFood(CHICKEN, 0)).toEqual(zero);
    expect(scaleFood(CHICKEN, -50)).toEqual(zero);
    expect(scaleFood(CHICKEN, Number.NaN)).toEqual(zero);
    expect(scaleFood(CHICKEN, Number.POSITIVE_INFINITY)).toEqual(zero);
  });
});

describe("F2 servingsToGrams", () => {
  it("turns 1.5 servings of a 500 g bowl into 750 g", () => {
    expect(servingsToGrams(1.5, 500)).toBe(750);
  });

  it("gives the same numbers as typing the grams", () => {
    expect(scaleFood(PHO, servingsToGrams(1.5, 500))).toEqual(
      scaleFood(PHO, 750),
    );
    // 60 × 7.5 = 450 kcal; 4 × 7.5 = 30; 8 × 7.5 = 60; 1.2 × 7.5 = 9.
    expect(scaleFood(PHO, 750)).toEqual({
      grams: 750,
      kcal: 450,
      protein: 30,
      carbs: 60,
      fat: 9,
    });
  });

  it("is zero for an empty or negative number of servings", () => {
    expect(servingsToGrams(0, 500)).toBe(0);
    expect(servingsToGrams(-1, 500)).toBe(0);
  });
});

describe("F3, F4 kcalFromMacros and kcalGap", () => {
  it("adds 4/4/9 kcal per gram of protein/carbs/fat", () => {
    // 31 × 4 + 0 × 4 + 3.6 × 9 = 124 + 32.4 = 156.4
    expect(kcalFromMacros(CHICKEN)).toBeCloseTo(156.4, 10);
  });

  it("F3: 165 kcal against 156.4 is a 5.2 % gap, within the limit", () => {
    const gap = kcalGap(165, CHICKEN);

    // (165 − 156.4) / 165 = 0.05212
    expect(gap).toBeCloseTo(0.0521, 4);
    expect(gap).toBeLessThan(0.1);
  });

  it("F4: 65 kcal against 156.4 is far above 10 %", () => {
    // (156.4 − 65) / 65 = 1.406
    expect(kcalGap(65, CHICKEN)).toBeCloseTo(1.406, 3);
    expect(kcalGap(65, CHICKEN)).toBeGreaterThan(0.1);
  });

  it("measures a gap in both directions", () => {
    // 200 kcal vs 156.4: (200 − 156.4) / 200 = 0.218
    expect(kcalGap(200, CHICKEN)).toBeCloseTo(0.218, 3);
  });

  it("counts 0 kcal against real macros as a full gap, and 0 against 0 as none", () => {
    expect(kcalGap(0, CHICKEN)).toBe(1);
    expect(kcalGap(0, { protein: 0, carbs: 0, fat: 0 })).toBe(0);
  });
});

describe("F5 macroSplit", () => {
  it("uses 4/4/9 and sums to 100", () => {
    // Chicken: P 124, C 0, F 32.4 of 156.4 -> 79.3 % / 0 % / 20.7 %.
    expect(macroSplit(CHICKEN)).toEqual({ protein: 79, carbs: 0, fat: 21 });
  });

  it("splits a balanced food by calories, not by grams", () => {
    // 10 g each: P 40, C 40, F 90 of 170 -> 23.5 / 23.5 / 52.9.
    const split = macroSplit({ protein: 10, carbs: 10, fat: 10 });

    expect(split).toEqual({ protein: 24, carbs: 23, fat: 53 });
    expect(split.protein + split.carbs + split.fat).toBe(100);
  });

  it("is a pure fat split for oil", () => {
    expect(macroSplit({ protein: 0, carbs: 0, fat: 100 })).toEqual({
      protein: 0,
      carbs: 0,
      fat: 100,
    });
  });

  it("is all zero for a food without macros", () => {
    expect(macroSplit({ protein: 0, carbs: 0, fat: 0 })).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it("always adds up to 100 for awkward numbers", () => {
    const split = macroSplit({ protein: 1, carbs: 1, fat: 1 });

    // 4 / 4 / 9 of 17 -> 23.5 / 23.5 / 52.9.
    expect(split.protein + split.carbs + split.fat).toBe(100);
  });
});

describe("formatGrams", () => {
  it("uses a decimal comma with at most one decimal", () => {
    expect(formatGrams(46.5)).toBe("46,5");
    expect(formatGrams(150)).toBe("150");
    expect(formatGrams(5.43)).toBe("5,4");
  });
});
