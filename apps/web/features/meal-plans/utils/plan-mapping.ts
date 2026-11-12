import {
  type MealLogResponse,
  type MealMarkResponse,
  type PlanDayResponse,
  toNameKey,
} from "@pt/contracts";

import type { Food } from "@/features/foods/types/food";
import { localizeFoodName } from "@/features/foods/utils/food-locale";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type { PlanDay, PlanFood } from "@/features/meal-plans/types/meal-plan";
import { localizeMessageFor } from "@/i18n/localize-message";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

type FoodFacts = Pick<
  Food,
  | "id"
  | "name"
  | "nameKey"
  | "nameEn"
  | "nameZh"
  | "group"
  | "state"
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
>;

// A food as the plan screens need it, named in `locale`. The search also
// matches the name in the user's language.
export const toPlanFood = (
  food: FoodFacts,
  isArchived: boolean,
  locale: Locale,
): PlanFood => {
  const name = localizeFoodName(food, locale);

  return {
    id: food.id,
    name,
    nameKey: food.nameKey,
    ...(locale === DEFAULT_LOCALE
      ? {}
      : { searchKey: `${food.nameKey} ${toNameKey(name)}` }),
    group: food.group,
    state: food.state,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    isArchived,
  };
};

// The API's plan days with their foods named in `locale`.
export const toPlanDays = (
  days: PlanDayResponse[],
  locale: Locale,
): PlanDay[] =>
  days.map((day) => ({
    id: day.id,
    date: day.date,
    meals: day.meals.map((meal) => ({
      id: meal.id,
      position: meal.position,
      name: meal.name,
      sharePercent: meal.sharePercent,
      items: meal.items.map((item) => ({
        id: item.id,
        foodId: item.foodId,
        grams: item.grams,
        food: toPlanFood(item.food, item.food.isArchived, locale),
      })),
    })),
  }));

// A library log is named like the food in the user's language; a free food
// keeps what was typed; a vanished food gets the localized placeholder.
const toLogName = (log: MealLogResponse, locale: Locale) => {
  if (log.isMissingFood) {
    return localizeMessageFor(locale, log.name);
  }
  if (log.isFree) {
    return log.name;
  }
  return localizeFoodName(
    {
      name: log.name,
      nameKey: toNameKey(log.name),
      nameEn: log.nameEn,
      nameZh: log.nameZh,
    },
    locale,
  );
};

// Logs and marks of the given plan meals (the trainee's page and the PT's
// view read the same). The API sends the whole week; a screen shows one day.
export const toMealLogData = (
  logs: MealLogResponse[],
  marks: MealMarkResponse[],
  mealIds: number[],
  locale: Locale,
): { logs: MealLog[]; marks: MealMark[] } => {
  const wanted = new Set(mealIds);

  return {
    logs: logs
      .filter((log) => wanted.has(log.mealId))
      .map((log) => ({
        id: log.id,
        mealId: log.mealId,
        foodId: log.foodId,
        name: toLogName(log, locale),
        isFree: log.isFree,
        isArchived: log.isArchived,
        isMissingFood: log.isMissingFood,
        grams: log.grams,
        typed: log.typed,
        nutrition: log.nutrition,
      })),
    marks: marks.filter((mark) => wanted.has(mark.mealId)),
  };
};
