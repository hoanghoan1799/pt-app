import { formatGrams } from "@/features/foods/utils/food-math";
import type { LogNutrition } from "@/features/meal-plans/types/meal-log";
import type { PlanFood } from "@/features/meal-plans/types/meal-plan";
import { kcalOf, macrosOf } from "@/features/meal-plans/utils/plan-totals";

type Per100 = Pick<PlanFood, "protein" | "carbs" | "fat">;

interface TypedNumbers {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

const EMPTY: LogNutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

// A library food: its per-100 g macros scaled to the grams eaten (unrounded),
// kcal following from the macros (4/4/9) like the plan and the targets, so
// eating exactly the plan shows the plan's kcal.
// A free food: what the trainee typed, an empty macro counting as 0 and kcal
// following from the macros (4/4/9) when left empty; null when nothing was
// typed at all.
export const resolveLogNutrition = (
  grams: number,
  food: Per100 | null,
  typed: TypedNumbers,
): LogNutrition | null => {
  if (food) {
    const macros = macrosOf(food, grams);

    return { ...macros, kcal: kcalOf(macros) };
  }
  if (Object.values(typed).every((value) => value === null)) {
    return null;
  }

  const macros = {
    protein: typed.protein ?? 0,
    carbs: typed.carbs ?? 0,
    fat: typed.fat ?? 0,
  };

  return { ...macros, kcal: typed.kcal ?? kcalOf(macros) };
};

// A planned item as the counting needs it; `food` is null when the food row is
// gone (it then counts 0 g).
export interface CountedItem {
  foodId: number;
  grams: number;
  food: Per100 | null;
}

// A logged food: its resolved numbers (null = nothing typed, counts 0).
export interface CountedLog {
  foodId: number | null;
  nutrition: LogNutrition | null;
}

// What counts as eaten in one planned meal, part by part (KAN-87).
// Not marked "Đạt": the logs. Marked: every planned item at its planned grams,
// except a food the trainee also logged (same food), where the logged grams
// count instead; all other logs (free foods, foods off the plan) come on top.
export const listMealNutrition = (
  items: CountedItem[],
  logs: CountedLog[],
  isAchieved: boolean,
): (LogNutrition | null)[] => {
  const parts = logs.map((log) => log.nutrition);

  if (!isAchieved) {
    return parts;
  }

  const loggedFoodIds = new Set(logs.map((log) => log.foodId));
  const unlogged = items
    .filter((item) => !loggedFoodIds.has(item.foodId))
    .map((item) => {
      if (!item.food) {
        return null;
      }
      const macros = macrosOf(item.food, item.grams);

      return { ...macros, kcal: kcalOf(macros) };
    });

  return [...unlogged, ...parts];
};

export const countMealNutrition = (
  items: CountedItem[],
  logs: CountedLog[],
  isAchieved: boolean,
): LogNutrition => sumLogNutrition(listMealNutrition(items, logs, isAchieved));

// How many foods the counted numbers come from.
export const countMealEntries = (
  items: CountedItem[],
  logs: CountedLog[],
  isAchieved: boolean,
) => listMealNutrition(items, logs, isAchieved).length;

export const sumLogNutrition = (parts: (LogNutrition | null)[]): LogNutrition =>
  parts.reduce<LogNutrition>(
    (sum, part) =>
      part
        ? {
            kcal: sum.kcal + part.kcal,
            protein: sum.protein + part.protein,
            carbs: sum.carbs + part.carbs,
            fat: sum.fat + part.fat,
          }
        : sum,
    EMPTY,
  );

// "330 kcal · P 62 · C 0 · F 7,2"
export const formatNutrition = (nutrition: LogNutrition) =>
  `${Math.round(nutrition.kcal)} kcal · P ${formatGrams(nutrition.protein)} · C ${formatGrams(nutrition.carbs)} · F ${formatGrams(nutrition.fat)}`;

// "200 g", or nothing when the amount is unknown.
export const formatLogGrams = (grams: number) =>
  grams > 0 ? `${formatGrams(grams)} g` : "";
