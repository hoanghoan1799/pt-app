import { describe, expect, it } from "vitest";

import type { BodyProfileValues } from "../rules/types.js";
import {
  ManualTarget,
  type NutritionTargetStrategy,
  TargetCalculator,
  TdeeTarget,
} from "./target-strategy.js";

const PROFILE: BodyProfileValues = {
  sex: "male",
  birthYear: 1996,
  heightCm: 175,
  weightKg: 75,
  activityLevel: "moderate",
  goal: "maintain",
  kcalAdjustment: null,
  proteinPerKg: null,
};
const TODAY = "2026-10-05";

describe("ManualTarget", () => {
  it("returns exactly the grams the PT typed", () => {
    expect(
      new ManualTarget().compute({ carbs: 250, protein: 160, fat: 60 }),
    ).toEqual({ carbs: 250, protein: 160, fat: 60 });
  });
});

describe("TdeeTarget", () => {
  const tdee = new TdeeTarget();

  it("maintains at TDEE with the legacy goal values", () => {
    // TDEE 2633; protein 75 x 1.8 = 135; fat 25% / 9 = 73 -> 75; carbs 355.
    expect(tdee.compute({ profile: PROFILE, today: TODAY })).toEqual({
      carbs: 355,
      protein: 135,
      fat: 75,
    });
  });

  it("adds the PT's kcal adjustment and protein per kg", () => {
    expect(
      tdee.compute({
        profile: { ...PROFILE, kcalAdjustment: -200, proteinPerKg: 2 },
        today: TODAY,
      }),
    ).toEqual({ carbs: 300, protein: 150, fat: 70 });
  });

  it("never goes below the BMR", () => {
    const { carbs, protein, fat } = tdee.compute({
      profile: { ...PROFILE, kcalAdjustment: -1500, proteinPerKg: 1 },
      today: TODAY,
    });

    // Floored to BMR 1698.75 -> 1700 kcal: well above TDEE - 1500 = 1133.
    expect(carbs * 4 + protein * 4 + fat * 9).toBeGreaterThan(1650);
  });

  it("ages with the date it is given", () => {
    const younger = tdee.compute({ profile: PROFILE, today: "2020-01-01" });
    const older = tdee.compute({ profile: PROFILE, today: TODAY });

    // Younger = higher BMR = more kcal, so more carbs.
    expect(younger.carbs).toBeGreaterThan(older.carbs);
  });
});

describe("TargetCalculator", () => {
  it("picks the strategy by source", () => {
    const calculator = new TargetCalculator([
      new ManualTarget(),
      new TdeeTarget(),
    ]);

    expect(
      calculator.compute("manual", { carbs: 1, protein: 2, fat: 3 }),
    ).toEqual({
      carbs: 1,
      protein: 2,
      fat: 3,
    });
    expect(
      calculator.compute("tdee", { profile: PROFILE, today: TODAY }).protein,
    ).toBe(135);
  });

  it("runs a strategy added later without changing the context", () => {
    const fixed: NutritionTargetStrategy<"manual"> = {
      source: "manual",
      compute: () => ({ carbs: 9, protein: 9, fat: 9 }),
    };

    expect(
      new TargetCalculator([fixed]).compute("manual", {
        carbs: 1,
        protein: 1,
        fat: 1,
      }),
    ).toEqual({ carbs: 9, protein: 9, fat: 9 });
  });

  it("fails loudly for a source nobody registered", () => {
    expect(() =>
      new TargetCalculator([new ManualTarget()]).compute("tdee", {
        profile: PROFILE,
        today: TODAY,
      }),
    ).toThrow('No nutrition target strategy for "tdee"');
  });
});
