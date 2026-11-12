import type { FoodGroup } from "@/features/foods/types/food";
import type { Macro } from "@/features/nutrition/types/nutrition";

// Q3: the first three meals, then "Bữa phụ 1, 2...".
export const BASE_MEAL_NAMES = ["Bữa sáng", "Bữa trưa", "Bữa tối"] as const;
export const SNACK_NAME_PREFIX = "Bữa phụ";

// Total of the meal shares when the PT splits the day by percent (Q4).
export const SHARE_TOTAL_PERCENT = 100;

// Auto grams are rounded to this step (Q5).
export const GRAMS_STEP = 5;

// Fat weighs 100x less than protein and carbs in the solver: the foods the PT
// chose are fitted to protein and carbs first, fat only decides the grams of
// foods that are mostly fat (oil), and what is left over is shown as a gap.
export const SOLVER_MACRO_WEIGHTS: Record<Macro, number> = {
  protein: 1,
  carbs: 1,
  fat: 0.01,
};

// A meal is told it is short or over only from this many grams, so a rounding
// leftover is not reported.
export const MEAL_GAP_MIN_GRAMS = 5;

// Q6: library groups that fill a missing macro, most fitting first.
export const GAP_SUGGESTION_GROUPS: Record<Macro, FoodGroup[]> = {
  fat: ["fat_oil", "legume_nut"],
  protein: ["meat", "seafood", "egg_dairy", "legume_nut"],
  carbs: ["starch", "fruit"],
};

export const MAX_GAP_SUGGESTIONS = 3;

// Display labels are keys under the mealPlans.labels namespace (translated at render).
export const MACRO_GAP_LABEL_KEYS = {
  protein: "gap.protein",
  carbs: "gap.carbs",
  fat: "gap.fat",
} as const;

export const COMPARED_METRIC_LABELS = {
  kcal: { nameKey: "metric.kcal", unit: "kcal" },
  protein: { nameKey: "metric.protein", unit: "g" },
  carbs: { nameKey: "metric.carbs", unit: "g" },
  fat: { nameKey: "metric.fat", unit: "g" },
} as const;

// A planned day is flagged when its kcal differ from the target by more than
// ON_TARGET.kcalDiff; only days within this many days from the shown week
// are checked.
export const NOTICE_HORIZON_DAYS = 28;
