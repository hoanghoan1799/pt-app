import { describe, expect, it } from "vitest";

import { solveGrams } from "@/features/meal-plans/utils/solve-grams";

// Seed values per 100 g (features/foods/constants/seed-foods.ts).
const CHICKEN = { id: 1, protein: 31, carbs: 0, fat: 3.6 };
const RICE = { id: 2, protein: 2.7, carbs: 28.2, fat: 0.3 };
const BROCCOLI = { id: 3, protein: 2.4, carbs: 7.2, fat: 0.4 };
const OLIVE_OIL = { id: 4, protein: 0, carbs: 0, fat: 100 };

describe("solveGrams", () => {
  it("worked example: chicken and rice around 300 g of broccoli, fat short", () => {
    const result = solveGrams({
      target: { protein: 160, carbs: 235, fat: 55 },
      foods: [CHICKEN, RICE],
      fixed: [{ food: BROCCOLI, grams: 300 }],
    });

    // By hand: broccoli gives P 7.2, C 21.6, F 1.2, so the foods must give
    // P 152.8 and C 213.4. Rice = 213.4 / 0.282 = 756.7 g; chicken =
    // (152.8 - 0.027 * 756.7) / 0.31 = 427.0 g. The spec's 427 g / 757 g are
    // these unrounded values; at the 5 g step they become 425 g / 755 g.
    expect(result.grams).toEqual([
      { foodId: 1, grams: 425 },
      { foodId: 2, grams: 755 },
    ]);
    // P 131.75 + 20.385 + 7.2 = 159.335; C 212.91 + 21.6 = 234.51;
    // F 15.3 + 2.265 + 1.2 = 18.765.
    expect(result.totals.protein).toBeCloseTo(159.335, 6);
    expect(result.totals.carbs).toBeCloseTo(234.51, 6);
    expect(result.totals.fat).toBeCloseTo(18.765, 6);
    // 159.335 * 4 + 234.51 * 4 + 18.765 * 9 = 1744.2 -> 1744.
    expect(result.kcal).toBe(1744);
    // Gap = target - totals: 0.665, 0.49, 36.235 (one decimal).
    expect(result.gap).toEqual({ protein: 0.7, carbs: 0.5, fat: 36.2 });
    // 36.2 g fat short is what the PT is told: "Thiếu 36 g fat".
    expect(Math.round(result.gap.fat)).toBe(36);
  });

  it("with an oil in the meal all three macros are hit", () => {
    const result = solveGrams({
      target: { protein: 160, carbs: 235, fat: 55 },
      foods: [CHICKEN, RICE, OLIVE_OIL],
    });

    // By hand: rice 235 / 0.282 = 833.3 g; chicken (160 - 0.027 * 833.3) /
    // 0.31 = 443.5 g; oil (55 - 0.036 * 443.5 - 0.003 * 833.3) = 36.5 g.
    // At 5 g: 445 / 835 / 35.
    expect(result.grams).toEqual([
      { foodId: 1, grams: 445 },
      { foodId: 2, grams: 835 },
      { foodId: 4, grams: 35 },
    ]);
    // P 137.95 + 22.545 = 160.495; C 235.47; F 16.02 + 2.505 + 35 = 53.525.
    expect(result.totals.protein).toBeCloseTo(160.495, 6);
    expect(result.totals.carbs).toBeCloseTo(235.47, 6);
    expect(result.totals.fat).toBeCloseTo(53.525, 6);
    expect(result.gap.fat).toBeCloseTo(1.5, 6);
  });

  it("never returns negative grams: a food that does not help gets 0", () => {
    // Only protein is asked for; rice would add carbs nobody wants.
    const result = solveGrams({
      target: { protein: 40, carbs: 0, fat: 0 },
      foods: [CHICKEN, RICE],
    });

    expect(result.grams.map((entry) => entry.grams)).toEqual([130, 0]);
    expect(result.grams.every((entry) => entry.grams >= 0)).toBe(true);
    // 130 g chicken = P 40.3, F 4.68.
    expect(result.totals.protein).toBeCloseTo(40.3, 6);
    expect(result.gap.protein).toBeCloseTo(-0.3, 6);
    expect(result.gap.fat).toBeCloseTo(-4.7, 6);
  });

  it("solves one food by its own macro", () => {
    // 100 g rice has 28.2 g carbs: 56.4 g carbs need 200 g.
    const result = solveGrams({
      target: { protein: 0, carbs: 56.4, fat: 0 },
      foods: [RICE],
    });

    expect(result.grams).toEqual([{ foodId: 2, grams: 200 }]);
  });

  it("reports the whole target as gap when there is nothing to solve", () => {
    const result = solveGrams({
      target: { protein: 40, carbs: 60, fat: 20 },
      foods: [],
    });

    expect(result.grams).toEqual([]);
    expect(result.gap).toEqual({ protein: 40, carbs: 60, fat: 20 });
    expect(result.kcal).toBe(0);
  });

  it("shows fixed foods that already exceed the target as a negative gap", () => {
    // 500 g broccoli: C 36, F 2 against C 10, F 0.
    const result = solveGrams({
      target: { protein: 0, carbs: 10, fat: 0 },
      foods: [RICE],
      fixed: [{ food: BROCCOLI, grams: 500 }],
    });

    expect(result.grams).toEqual([{ foodId: 2, grams: 0 }]);
    expect(result.gap.carbs).toBe(-26);
  });

  it("is deterministic and survives two identical foods", () => {
    const input = {
      target: { protein: 60, carbs: 80, fat: 10 },
      foods: [CHICKEN, RICE, { ...RICE, id: 9 }],
    };

    expect(solveGrams(input)).toEqual(solveGrams(input));
    expect(
      solveGrams(input).grams.every((entry) => Number.isFinite(entry.grams)),
    ).toBe(true);
  });

  it("rounds every solved amount to a multiple of 5 g", () => {
    const result = solveGrams({
      target: { protein: 137, carbs: 211, fat: 47 },
      foods: [CHICKEN, RICE, OLIVE_OIL],
    });

    for (const { grams } of result.grams) {
      expect(grams % 5).toBe(0);
    }
  });

  it("caps grams at 3000 and reports the rest as a gap", () => {
    // Lettuce: 1 g carbs per 100 g. 235 g carbs would need 23,500 g.
    const lettuce = { id: 7, protein: 0, carbs: 1, fat: 0 };
    const result = solveGrams({
      target: { protein: 0, carbs: 235, fat: 0 },
      foods: [lettuce],
    });

    expect(result.grams).toEqual([{ foodId: 7, grams: 3000 }]);
    expect(result.totals.carbs).toBeCloseTo(30, 6);
    expect(result.gap.carbs).toBeCloseTo(205, 6);
  });

  it("returns finite grams for collinear foods (two pure oils)", () => {
    const oilA = { id: 1, protein: 0, carbs: 0, fat: 100 };
    const oilB = { id: 2, protein: 0, carbs: 0, fat: 100 };
    const result = solveGrams({
      target: { protein: 0, carbs: 0, fat: 55 },
      foods: [oilA, oilB],
    });

    for (const { grams } of result.grams) {
      expect(Number.isFinite(grams)).toBe(true);
      expect(grams).toBeGreaterThanOrEqual(0);
    }
    // Together they give the 55 g of fat, within the 5 g step.
    expect(Math.abs(result.gap.fat)).toBeLessThanOrEqual(2.5);
  });

  it("returns finite grams when a food gives nothing at all", () => {
    const water = { id: 1, protein: 0, carbs: 0, fat: 0 };
    const result = solveGrams({
      target: { protein: 20, carbs: 20, fat: 5 },
      foods: [water, { id: 2, protein: 31, carbs: 0, fat: 3.6 }],
    });

    expect(result.grams.every((g) => Number.isFinite(g.grams))).toBe(true);
    expect(result.grams[0].grams).toBe(0);
  });
});
