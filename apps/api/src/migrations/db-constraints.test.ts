import {
  BODY_LIMITS,
  EXERCISE_LIMITS,
  KCAL_ADJUSTMENT_LIMITS,
  MEAL_PLAN_LIMITS,
  NUTRITION_LIMITS,
  PROTEIN_PER_KG_LIMITS,
  SET_LIMITS,
} from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { LIMITS } from "./1795100000000-DbConstraints.js";

// The migration keeps its own copy of the limits (it must not change when the
// contracts do); this is what tells you that the copy and the contract differ.
describe("db-constraints migration limits", () => {
  it("equal the contract constants", () => {
    expect(LIMITS.setReps).toEqual({
      min: SET_LIMITS.MIN_REPS,
      max: SET_LIMITS.MAX_REPS,
    });
    expect(LIMITS.setWeightKg).toEqual({
      min: SET_LIMITS.MIN_WEIGHT_KG,
      max: SET_LIMITS.MAX_WEIGHT_KG,
    });
    expect(LIMITS.exerciseSets.max).toBe(EXERCISE_LIMITS.MAX_SETS);
    expect(LIMITS.mealGrams.max).toBe(MEAL_PLAN_LIMITS.MAX_GRAMS);
    expect(LIMITS.nutritionGrams.max).toBe(NUTRITION_LIMITS.MAX_GRAMS);
    expect(LIMITS.heightCm).toEqual(BODY_LIMITS.HEIGHT_CM);
    expect(LIMITS.weightKg).toEqual(BODY_LIMITS.WEIGHT_KG);
    expect(LIMITS.kcalAdjustment).toEqual(KCAL_ADJUSTMENT_LIMITS);
    expect(LIMITS.proteinPerKg).toEqual(PROTEIN_PER_KG_LIMITS);
  });

  it("keep a birth year for every age the form accepts, for the next decades", () => {
    const now = new Date().getUTCFullYear();

    for (const year of [now, now + 25, now + 70]) {
      expect(year - BODY_LIMITS.AGE.max).toBeGreaterThanOrEqual(
        LIMITS.birthYear.min,
      );
      expect(year - BODY_LIMITS.AGE.min).toBeLessThanOrEqual(
        LIMITS.birthYear.max,
      );
    }
  });

  it("uses a share between 0 and 100 percent", () => {
    expect(LIMITS.sharePercent).toEqual({ min: 0, max: 100 });
  });
});
