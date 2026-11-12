import { MEAL_PLAN_LIMITS } from "@pt/contracts";

import {
  GAP_SUGGESTION_GROUPS,
  GRAMS_STEP,
  MAX_GAP_SUGGESTIONS,
  MEAL_GAP_MIN_GRAMS,
} from "@/features/meal-plans/constants/meal-plans";
import type {
  MacroGap,
  MealGapNotice,
  PlanFood,
} from "@/features/meal-plans/types/meal-plan";
import { kcalOf } from "@/features/meal-plans/utils/plan-totals";
import { MACROS } from "@/features/nutrition/constants/nutrition";
import type {
  ComparedMetric,
  Macro,
  MacroAmounts,
  MacroComparison,
} from "@/features/nutrition/types/nutrition";
import { compareToTarget } from "@/features/nutrition/utils/nutrition";

export type DayPlanStatus = "empty" | "no-target" | "on" | "off";

export interface DayPlanCheck {
  status: DayPlanStatus;
  // Per metric, how the plan compares with the day target (ON_TARGET rule).
  comparisons: Record<ComparedMetric, MacroComparison> | null;
}

// S2 + R5: the plan is on target when kcal are within 80 kcal of the day's
// kcal, protein is at most 5 g under, and carbs and fat are within 10 g. The
// rule itself lives in compareToTarget (ON_TARGET); this only applies it to
// the plan's totals, the same way the food log judges a day.
export const checkDayPlan = (
  totals: MacroAmounts,
  target: MacroAmounts | null,
  hasItems: boolean,
): DayPlanCheck => {
  if (!hasItems) {
    return { status: "empty", comparisons: null };
  }
  if (!target) {
    return { status: "no-target", comparisons: null };
  }

  const comparisons = {
    kcal: compareToTarget(kcalOf(totals), kcalOf(target), "kcal"),
    protein: compareToTarget(totals.protein, target.protein, "protein"),
    carbs: compareToTarget(totals.carbs, target.carbs, "carbs"),
    fat: compareToTarget(totals.fat, target.fat, "fat"),
  };
  const isOn = Object.values(comparisons).every(
    ({ status }) => status === "on" || status === "none",
  );

  return { status: isOn ? "on" : "off", comparisons };
};

// Q6: the macros a meal is short of (or over), biggest first. A leftover below
// MEAL_GAP_MIN_GRAMS is rounding, not a gap, and extra protein is fine.
export const describeMealGaps = (gap: MacroGap): MealGapNotice[] =>
  MACROS.flatMap((macro): MealGapNotice[] => {
    const value = Math.round(gap[macro]);

    if (value >= MEAL_GAP_MIN_GRAMS) {
      return [{ macro, kind: "short", grams: value }];
    }
    if (value <= -MEAL_GAP_MIN_GRAMS && macro !== "protein") {
      return [{ macro, kind: "over", grams: -value }];
    }
    return [];
  }).sort((a, b) => b.grams - a.grams);

export interface GapSuggestion {
  food: PlanFood;
  // Grams that would close the gap, rounded to 5 g (at least 5).
  grams: number;
}

// Q6: library foods of the groups that fill a missing macro (fat: Dầu & chất
// béo, Đậu & hạt). The richest food of each group comes first, then the next
// richest; foods already in the meal are skipped.
export const suggestFoodsForGap = (
  macro: Macro,
  gapGrams: number,
  library: PlanFood[],
  excludeFoodIds: number[] = [],
  limit = MAX_GAP_SUGGESTIONS,
): GapSuggestion[] => {
  const groups = GAP_SUGGESTION_GROUPS[macro];
  const candidates = library
    .filter(
      (food) =>
        !food.isArchived &&
        !excludeFoodIds.includes(food.id) &&
        food[macro] > 0 &&
        groups.includes(food.group),
    )
    .sort((a, b) => b[macro] - a[macro] || a.id - b.id);
  const picked: PlanFood[] = [];

  for (const group of groups) {
    const best = candidates.find((food) => food.group === group);

    if (best && picked.length < limit) {
      picked.push(best);
    }
  }
  for (const food of candidates) {
    if (picked.length >= limit) {
      break;
    }
    if (!picked.includes(food)) {
      picked.push(food);
    }
  }

  return (
    picked
      .map((food) => ({
        food,
        grams: Math.max(
          GRAMS_STEP,
          Math.round(((gapGrams / food[macro]) * 100) / GRAMS_STEP) *
            GRAMS_STEP,
        ),
      }))
      // A plan holds at most MAX_GRAMS of a food: drop what would not fit.
      .filter(({ grams }) => grams <= MEAL_PLAN_LIMITS.MAX_GRAMS)
  );
};
