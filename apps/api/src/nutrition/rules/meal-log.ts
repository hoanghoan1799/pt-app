import { calculateCalories } from "./nutrition-math.js";
import type { LogNutrition, MacroAmounts, Per100 } from "./types.js";

interface TypedNumbers {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

const EMPTY: LogNutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const macrosOf = (food: Per100, grams: number): MacroAmounts => ({
  carbs: (food.carbs * grams) / 100,
  protein: (food.protein * grams) / 100,
  fat: (food.fat * grams) / 100,
});

export const sumMacros = (parts: MacroAmounts[]): MacroAmounts =>
  parts.reduce(
    (sum, part) => ({
      carbs: sum.carbs + part.carbs,
      protein: sum.protein + part.protein,
      fat: sum.fat + part.fat,
    }),
    { carbs: 0, protein: 0, fat: 0 },
  );

// The macros of a food at the given grams, kcal following from the macros
// (4/4/9).
export const nutritionOfFood = (food: Per100, grams: number): LogNutrition => {
  const macros = macrosOf(food, grams);

  return { ...macros, kcal: calculateCalories(macros) };
};

// A library food: the numbers stored when it was logged (KAN-93), else its
// per-100 g macros scaled to the grams eaten. A free food: what the trainee
// typed (an empty macro counts 0; kcal follows the macros when left empty);
// null when nothing was typed at all.
export const resolveLogNutrition = (
  grams: number,
  food: Per100 | null,
  typed: TypedNumbers,
): LogNutrition | null => {
  if (food) {
    if (Object.values(typed).some((value) => value !== null)) {
      const macros = {
        protein: typed.protein ?? 0,
        carbs: typed.carbs ?? 0,
        fat: typed.fat ?? 0,
      };

      return { ...macros, kcal: typed.kcal ?? calculateCalories(macros) };
    }
    return nutritionOfFood(food, grams);
  }
  if (Object.values(typed).every((value) => value === null)) {
    return null;
  }

  const macros = {
    protein: typed.protein ?? 0,
    carbs: typed.carbs ?? 0,
    fat: typed.fat ?? 0,
  };

  return { ...macros, kcal: typed.kcal ?? calculateCalories(macros) };
};

// A planned item as the counting needs it; `food` is null when the food row is
// gone (it then counts 0 g).
export interface CountedItem {
  foodId: number;
  grams: number;
  food: Per100 | null;
}

// A planned item as it was when the meal was marked "Đạt" (KAN-93).
export interface FrozenItem {
  foodId: number;
  nutrition: LogNutrition;
}

export interface CountedLog {
  foodId: number | null;
  nutrition: LogNutrition | null;
}

// What counts as eaten in one planned meal, part by part (KAN-87).
// Not marked "Đạt": the logs. Marked: every planned item at its planned grams,
// except a food the trainee also logged (same food), where the logged grams
// count instead; all other logs come on top. A mark with frozen items counts
// those instead of the live plan.
export const listMealNutrition = (
  items: CountedItem[],
  logs: CountedLog[],
  isAchieved: boolean,
  frozen: FrozenItem[] = [],
): (LogNutrition | null)[] => {
  const parts = logs.map((log) => log.nutrition);

  if (!isAchieved) {
    return parts;
  }

  const loggedFoodIds = new Set(logs.map((log) => log.foodId));
  const unlogged = frozen.length
    ? frozen
        .filter((item) => !loggedFoodIds.has(item.foodId))
        .map((item) => item.nutrition)
    : items
        .filter((item) => !loggedFoodIds.has(item.foodId))
        .map((item) =>
          item.food ? nutritionOfFood(item.food, item.grams) : null,
        );

  return [...unlogged, ...parts];
};

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
