import type {
  PlanFood,
  PlanItem,
  PlanMeal,
} from "@/features/meal-plans/types/meal-plan";
import type { MacroAmounts } from "@/features/nutrition/types/nutrition";
import { calculateCalories } from "@/features/nutrition/utils/nutrition";

const EMPTY: MacroAmounts = { carbs: 0, protein: 0, fat: 0 };

export const macrosOf = (
  food: Pick<PlanFood, "protein" | "carbs" | "fat">,
  grams: number,
): MacroAmounts => ({
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
    EMPTY,
  );

export const sumItems = (items: PlanItem[]) =>
  sumMacros(items.map((item) => macrosOf(item.food, item.grams)));

export const sumMeals = (meals: PlanMeal[]) =>
  sumMacros(meals.map((meal) => sumItems(meal.items)));

// Calories follow from the macros (4/4/9), as everywhere else in the app.
export const kcalOf = calculateCalories;
