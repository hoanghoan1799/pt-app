import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { foods, mealPlanItems, mealPlanMeals } from "@/db/schema";
import { listFoods } from "@/features/foods/services/food-queries";
import type { Food } from "@/features/foods/types/food";
import { localizeFoodName } from "@/features/foods/utils/food-locale";
import { NOTICE_HORIZON_DAYS } from "@/features/meal-plans/constants/meal-plans";
import { listDaysInRange } from "@/features/meal-plans/services/meal-plan-store";
import type { PlanDay, PlanFood } from "@/features/meal-plans/types/meal-plan";
import {
  getPlanKcalNotices,
  type PlanKcalNotice,
} from "@/features/meal-plans/utils/plan-notice";
import {
  kcalOf,
  macrosOf,
  sumMacros,
} from "@/features/meal-plans/utils/plan-totals";
import { listTargets } from "@/features/nutrition/services/nutrition-queries";
import { findTargetForDate } from "@/features/nutrition/utils/nutrition";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";
import { toNameKey } from "@/utils/name";
import { addDays, getWeekDates } from "@/utils/week";

// Archived foods are NOT filtered out: a plan keeps showing what it was built
// with (KAN-65: "Xóa" archives).
const planFoodColumns = {
  id: foods.id,
  name: foods.name,
  nameKey: foods.nameKey,
  nameEn: foods.nameEn,
  nameZh: foods.nameZh,
  group: foods.group,
  state: foods.state,
  kcal: foods.kcal,
  protein: foods.protein,
  carbs: foods.carbs,
  fat: foods.fat,
  archivedAt: foods.archivedAt,
};

const toPlanFood = (
  row: Omit<PlanFood, "isArchived" | "searchKey"> &
    Pick<Food, "nameEn" | "nameZh">,
  isArchived: boolean,
  locale: Locale,
): PlanFood => {
  const name = localizeFoodName(row, locale);

  return {
    id: row.id,
    name,
    nameKey: row.nameKey,
    // The search also matches the name in the user's language.
    ...(locale === DEFAULT_LOCALE
      ? {}
      : { searchKey: `${row.nameKey} ${toNameKey(name)}` }),
    group: row.group,
    state: row.state,
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    isArchived,
  };
};

// The active library the PT searches when adding a food to a meal, named and
// sorted in `locale`.
export const listPlanFoods = async (
  locale: Locale = DEFAULT_LOCALE,
): Promise<PlanFood[]> =>
  (await listFoods())
    .map((food) => toPlanFood(food, false, locale))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

export const getMealPlanWeek = async (
  userId: number,
  weekStart: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<PlanDay[]> => {
  const dates = getWeekDates(weekStart);
  const dayRows = await listDaysInRange(
    userId,
    dates[0],
    dates[dates.length - 1],
  );

  if (!dayRows.length) {
    return [];
  }

  const mealRows = await db
    .select()
    .from(mealPlanMeals)
    .where(
      inArray(
        mealPlanMeals.dayId,
        dayRows.map((day) => day.id),
      ),
    )
    .orderBy(asc(mealPlanMeals.position), asc(mealPlanMeals.id));
  const itemRows = mealRows.length
    ? await db
        .select({
          id: mealPlanItems.id,
          mealId: mealPlanItems.mealId,
          foodId: mealPlanItems.foodId,
          grams: mealPlanItems.grams,
          food: planFoodColumns,
        })
        .from(mealPlanItems)
        .innerJoin(foods, eq(foods.id, mealPlanItems.foodId))
        .where(
          inArray(
            mealPlanItems.mealId,
            mealRows.map((meal) => meal.id),
          ),
        )
        .orderBy(asc(mealPlanItems.id))
    : [];

  return dayRows.map((day) => ({
    id: day.id,
    date: day.date,
    meals: mealRows
      .filter((meal) => meal.dayId === day.id)
      .map((meal) => ({
        id: meal.id,
        position: meal.position,
        name: meal.name,
        sharePercent: meal.sharePercent,
        items: itemRows
          .filter((item) => item.mealId === meal.id)
          .map(({ food, ...item }) => ({
            ...item,
            food: toPlanFood(food, food.archivedAt !== null, locale),
          })),
      })),
  }));
};

// Number of days with a plan in the week starting `weekStart`.
export const countPlanDays = async (userId: number, weekStart: string) => {
  const dates = getWeekDates(weekStart);

  return (await listDaysInRange(userId, dates[0], dates[dates.length - 1]))
    .length;
};

// Dates with a plan from `from` to `to` (the copy sheet marks them "sẽ ghi đè").
export const listPlanDates = async (userId: number, from: string, to: string) =>
  (await listDaysInRange(userId, from, to)).map((day) => day.date);

// S3: planned days from `from` onward (a few weeks) whose kcal are further
// than ON_TARGET.kcalDiff from the target that applies on that date now.
export const getPlanKcalNoticesFrom = async (
  userId: number,
  from: string,
): Promise<PlanKcalNotice[]> => {
  const dayRows = await listDaysInRange(
    userId,
    from,
    addDays(from, NOTICE_HORIZON_DAYS),
  );

  if (!dayRows.length) {
    return [];
  }

  const rows = await db
    .select({
      dayId: mealPlanMeals.dayId,
      grams: mealPlanItems.grams,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
    })
    .from(mealPlanItems)
    .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealPlanItems.mealId))
    .innerJoin(foods, eq(foods.id, mealPlanItems.foodId))
    .where(
      inArray(
        mealPlanMeals.dayId,
        dayRows.map((day) => day.id),
      ),
    );
  // The user's targets once; each date is resolved in memory.
  const targets = await listTargets(userId);

  return getPlanKcalNotices(
    dayRows.map((day) => {
      const target = findTargetForDate(targets, day.date);

      return {
        date: day.date,
        plannedKcal: kcalOf(
          sumMacros(
            rows
              .filter((row) => row.dayId === day.id)
              .map((row) => macrosOf(row, row.grams)),
          ),
        ),
        targetKcal: target ? kcalOf(target) : null,
      };
    }),
  );
};
