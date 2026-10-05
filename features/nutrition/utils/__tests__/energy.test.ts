import { describe, expect, it } from "vitest";

import type { BodyProfile } from "@/features/nutrition/types/nutrition";
import {
  calculateBmr,
  calculateCalories,
  calculateEnergyPlan,
  describeFoodEquivalent,
  formatCalories,
  formatDecimal,
  getAge,
  getBirthYear,
  toBodyProfile,
} from "@/features/nutrition/utils/energy";

const TODAY = "2026-10-05";

const MALE: BodyProfile = {
  sex: "male",
  birthYear: 1996,
  heightCm: 175,
  weightKg: 75,
  activityLevel: "moderate",
  goal: "maintain",
};

describe("age", () => {
  it("converts between age and birth year", () => {
    expect(getAge(1996, TODAY)).toBe(30);
    expect(getBirthYear(30, TODAY)).toBe(1996);
  });
});

describe("calculateBmr", () => {
  it("uses Mifflin-St Jeor", () => {
    // 10·75 + 6.25·175 − 5·30 + 5 = 1698.75
    expect(calculateBmr(MALE, 30)).toBeCloseTo(1698.75);
    // Same body as a woman: −161 instead of +5.
    expect(calculateBmr({ ...MALE, sex: "female" }, 30)).toBeCloseTo(1532.75);
  });
});

describe("calculateEnergyPlan", () => {
  it("maintains at TDEE", () => {
    const plan = calculateEnergyPlan(MALE, TODAY);

    // 1698.75 × 1.55 = 2633.06
    expect(plan).toMatchObject({
      age: 30,
      bmr: 1700,
      tdee: 2630,
      targetCalories: 2630,
    });
    // Protein 75 × 1.8 = 135 g; fat 25% of 2633 / 9 ≈ 73 → 75 g;
    // carbs (2633 − 540 − 675) / 4 ≈ 354 → 355 g.
    expect(plan.macros).toEqual({ carbs: 355, protein: 135, fat: 75 });
  });

  it("cuts 20% and raises protein", () => {
    const plan = calculateEnergyPlan({ ...MALE, goal: "cut" }, TODAY);

    expect(plan.targetCalories).toBe(2110);
    expect(plan.macros.protein).toBe(165);
    // Macros add up to the target within rounding.
    expect(
      Math.abs(calculateCalories(plan.macros) - plan.targetCalories),
    ).toBeLessThan(40);
  });

  it("never returns negative carbs", () => {
    const plan = calculateEnergyPlan(
      {
        ...MALE,
        weightKg: 200,
        heightCm: 120,
        activityLevel: "sedentary",
        goal: "cut",
      },
      TODAY,
    );

    expect(plan.macros.carbs).toBeGreaterThanOrEqual(0);
  });
});

describe("formatting", () => {
  it("describes food equivalents and calories", () => {
    expect(describeFoodEquivalent("carbs", 280)).toBe("≈ 10 lạng cơm chín");
    expect(describeFoodEquivalent("protein", 135)).toBe(
      "≈ 4,4 lạng ức gà chín",
    );
    expect(describeFoodEquivalent("fat", 56)).toBe("≈ 4 thìa dầu ăn");
    expect(formatCalories(2630)).toBe("2.630 kcal");
    expect(formatDecimal(72.5)).toBe("72,5");
    expect(formatDecimal(1750)).toBe("1750");
  });
});

describe("toBodyProfile", () => {
  const draft = {
    sex: "male" as const,
    age: "30",
    heightCm: "175",
    weightKg: "72,5",
    activityLevel: "moderate" as const,
    goal: "cut" as const,
  };

  it("parses decimal commas and derives the birth year", () => {
    expect(toBodyProfile(draft, TODAY)).toMatchObject({
      birthYear: 1996,
      weightKg: 72.5,
    });
  });

  it("returns null for incomplete or implausible numbers", () => {
    expect(toBodyProfile({ ...draft, weightKg: "" }, TODAY)).toBeNull();
    expect(toBodyProfile({ ...draft, heightCm: "17" }, TODAY)).toBeNull();
    expect(toBodyProfile({ ...draft, age: "30.5" }, TODAY)).toBeNull();
  });
});
