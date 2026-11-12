import { describe, expect, it } from "vitest";

import { GOALS } from "@/features/nutrition/constants/energy";
import type { BodyProfile } from "@/features/nutrition/types/nutrition";
import {
  calculateBmr,
  calculateEnergyPlan,
  formatCalories,
  formatDecimal,
  getAge,
  getBirthYear,
  getGoal,
  getGoalFromAdjustment,
  getLegacyKcalAdjustment,
  toBodyProfile,
} from "@/features/nutrition/utils/energy";
import { calculateCalories } from "@/features/nutrition/utils/nutrition";

const TODAY = "2026-10-05";

const MALE: BodyProfile = {
  sex: "male",
  birthYear: 1996,
  heightCm: 175,
  weightKg: 75,
  activityLevel: "moderate",
  goal: "maintain",
  kcalAdjustment: null,
  proteinPerKg: null,
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

describe("energy model (kcal adjustment + protein per kg)", () => {
  // TDEE 2633.06; protein 75 × 2 = 150 g.
  it("target is TDEE plus the adjustment", () => {
    const cut = calculateEnergyPlan(
      { ...MALE, kcalAdjustment: -200, proteinPerKg: 2 },
      TODAY,
    );

    // 2633.06 − 200 = 2433.06 → 2430; fat 25% / 9 = 67.6 → 70 g;
    // carbs (2433.06 − 600 − 630) / 4 = 300.8 → 300 g.
    expect(cut).toMatchObject({ tdee: 2630, targetCalories: 2430 });
    expect(cut.macros).toEqual({ carbs: 300, protein: 150, fat: 70 });

    const bulk = calculateEnergyPlan(
      { ...MALE, kcalAdjustment: 300, proteinPerKg: 2 },
      TODAY,
    );

    // 2933.06 → 2930; fat 81.5 → 80 g; carbs (2933.06 − 600 − 720) / 4 = 403.3.
    expect(bulk.targetCalories).toBe(2930);
    expect(bulk.macros).toEqual({ carbs: 405, protein: 150, fat: 80 });
  });

  it("zero adjustment maintains and ignores the stored goal", () => {
    const plan = calculateEnergyPlan(
      { ...MALE, goal: "bulk", kcalAdjustment: 0, proteinPerKg: 1.6 },
      TODAY,
    );

    expect(plan.targetCalories).toBe(2630);
    // 75 × 1.6 = 120 g protein; fat 73 → 75 g; carbs (2633.06 − 480 − 675) / 4.
    expect(plan.macros).toEqual({ carbs: 370, protein: 120, fat: 75 });
  });

  it("falls back to the legacy goal values while the fields are null", () => {
    const plan = calculateEnergyPlan({ ...MALE, goal: "cut" }, TODAY);

    expect(plan.targetCalories).toBe(2110);
    expect(plan.macros.protein).toBe(165);
  });

  it("each field falls back on its own", () => {
    const plan = calculateEnergyPlan({ ...MALE, proteinPerKg: 2 }, TODAY);

    expect(plan.targetCalories).toBe(2630);
    expect(plan.macros.protein).toBe(150);
  });

  it("derives the goal from the sign of the adjustment", () => {
    expect(getGoalFromAdjustment(-1)).toBe("cut");
    expect(getGoalFromAdjustment(0)).toBe("maintain");
    expect(getGoalFromAdjustment(1)).toBe("bulk");
    expect(getGoal({ ...MALE, goal: "bulk", kcalAdjustment: -200 })).toBe(
      "cut",
    );
    expect(getGoal({ ...MALE, goal: "bulk" })).toBe("bulk");
  });
});

describe("BMR floor", () => {
  // 10·45 + 6.25·150 − 5·60 − 161 = 926.5 kcal; × 1.2 = 1111.8 TDEE.
  const SMALL: BodyProfile = {
    sex: "female",
    birthYear: 1966,
    heightCm: 150,
    weightKg: 45,
    activityLevel: "sedentary",
    goal: "maintain",
    kcalAdjustment: -1000,
    proteinPerKg: 1.6,
  };

  it("raises a target below the BMR to the BMR and flags it", () => {
    const plan = calculateEnergyPlan(SMALL, TODAY);

    // 1111.8 − 1000 = 111.8 → floored to 926.5 → 930.
    expect(plan).toMatchObject({
      age: 60,
      bmr: 930,
      tdee: 1110,
      targetCalories: 930,
      isFlooredToBmr: true,
    });
    // Protein 72 → 70 g; fat 926.5 × 25% / 9 = 25.7 → 25 g;
    // carbs (926.5 − 280 − 225) / 4 = 105.4 → 105 g.
    expect(plan.macros).toEqual({ carbs: 105, protein: 70, fat: 25 });
  });

  it("does not flag a target at or above the BMR", () => {
    // 1111.8 − 185 = 926.8 ≥ 926.5.
    expect(
      calculateEnergyPlan({ ...SMALL, kcalAdjustment: -185 }, TODAY),
    ).toMatchObject({ isFlooredToBmr: false, targetCalories: 930 });
    expect(
      calculateEnergyPlan({ ...SMALL, kcalAdjustment: -186 }, TODAY)
        .isFlooredToBmr,
    ).toBe(true);
  });

  it("never returns negative fat or carbs", () => {
    const heavyProtein = calculateEnergyPlan(
      { ...SMALL, proteinPerKg: 3 },
      TODAY,
    );

    expect(heavyProtein.macros.fat).toBeGreaterThanOrEqual(0);
    expect(heavyProtein.macros.carbs).toBeGreaterThanOrEqual(0);
  });

  it("leaves legacy profiles (null adjustment) unfloored", () => {
    const plan = calculateEnergyPlan(
      { ...SMALL, kcalAdjustment: null, goal: "cut" },
      TODAY,
    );

    // 1111.8 × 0.8 = 889.4 < BMR, kept as before.
    expect(plan).toMatchObject({ targetCalories: 890, isFlooredToBmr: false });
  });
});

describe("legacy profile prefill", () => {
  it.each(["cut", "maintain", "bulk"] as const)(
    "saving a legacy %s profile untouched keeps its macros",
    (goal) => {
      const legacy = { ...MALE, goal, weightKg: 73.3, heightCm: 171 };
      const migrated = {
        ...legacy,
        kcalAdjustment: getLegacyKcalAdjustment(legacy, TODAY),
        proteinPerKg: GOALS[goal].proteinPerKg,
      };

      expect(calculateEnergyPlan(migrated, TODAY)).toEqual(
        calculateEnergyPlan(legacy, TODAY),
      );
    },
  );

  it("computes the gap from unrounded values", () => {
    // BMR 1698.75 × 1.55 = 2633.06; × (0.8 − 1) = −526.6 → −527.
    expect(getLegacyKcalAdjustment({ ...MALE, goal: "cut" }, TODAY)).toBe(-527);
    expect(getLegacyKcalAdjustment(MALE, TODAY)).toBe(0);
    // × 0.1 = +263.3 → 263.
    expect(getLegacyKcalAdjustment({ ...MALE, goal: "bulk" }, TODAY)).toBe(263);
  });
});

describe("formatting", () => {
  it("formats calories and decimals", () => {
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
    kcalAdjustment: "-200",
    proteinPerKg: "1,6",
  };

  it("parses decimal commas and derives the birth year", () => {
    expect(toBodyProfile(draft, TODAY)).toMatchObject({
      birthYear: 1996,
      weightKg: 72.5,
      kcalAdjustment: -200,
      proteinPerKg: 1.6,
    });
  });

  it("reads an empty energy model as not set", () => {
    expect(
      toBodyProfile({ ...draft, kcalAdjustment: "", proteinPerKg: "" }, TODAY),
    ).toMatchObject({ kcalAdjustment: null, proteinPerKg: null });
  });

  it("accepts signs and the bounds, rejects values outside", () => {
    const adjust = (kcalAdjustment: string) =>
      toBodyProfile({ ...draft, kcalAdjustment }, TODAY)?.kcalAdjustment;
    const protein = (proteinPerKg: string) =>
      toBodyProfile({ ...draft, proteinPerKg }, TODAY)?.proteinPerKg;

    expect(adjust("+300")).toBe(300);
    expect(adjust("−1500")).toBe(-1500);
    expect(adjust("1500")).toBe(1500);
    expect(adjust("1501")).toBeUndefined();
    expect(adjust("-1501")).toBeUndefined();
    expect(adjust("-200,5")).toBeUndefined();
    expect(protein("1")).toBe(1);
    expect(protein("3")).toBe(3);
    expect(protein("0,9")).toBeUndefined();
    expect(protein("3,1")).toBeUndefined();
  });

  it("returns null for incomplete or implausible numbers", () => {
    expect(toBodyProfile({ ...draft, weightKg: "" }, TODAY)).toBeNull();
    expect(toBodyProfile({ ...draft, heightCm: "17" }, TODAY)).toBeNull();
    expect(toBodyProfile({ ...draft, age: "30.5" }, TODAY)).toBeNull();
  });
});
