import "server-only";

import { MEAL_LOG_MESSAGES } from "@pt/contracts";
import { and, asc, between, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  foods,
  mealLogs,
  mealMarkItems,
  mealMarks,
  mealPlanDays,
  mealPlanMeals,
} from "@/db/schema";
import { localizeFoodName } from "@/features/foods/utils/food-locale";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import {
  buildWeekCompletion,
  type DayCompletion,
} from "@/features/meal-plans/utils/day-completion";
import { resolveLogNutrition } from "@/features/meal-plans/utils/meal-log";
import { localizeMessageFor } from "@/i18n/localize-message";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";
import { getWeekDates } from "@/utils/week";

const NO_NUMBERS = { kcal: null, protein: null, carbs: null, fat: null };

// Logs and marks of the given plan meals (the trainee's page and the PT's
// view read the same). Archived foods still resolve: a log keeps its numbers.
export const getMealLogData = async (
  mealIds: number[],
  locale: Locale = DEFAULT_LOCALE,
) => {
  if (!mealIds.length) {
    return { logs: [] as MealLog[], marks: [] as MealMark[] };
  }

  const [logRows, markRows, frozenRows] = await Promise.all([
    db
      .select({
        log: mealLogs,
        food: {
          name: foods.name,
          nameKey: foods.nameKey,
          nameEn: foods.nameEn,
          nameZh: foods.nameZh,
          kcal: foods.kcal,
          protein: foods.protein,
          carbs: foods.carbs,
          fat: foods.fat,
          archivedAt: foods.archivedAt,
        },
      })
      .from(mealLogs)
      .leftJoin(foods, eq(foods.id, mealLogs.foodId))
      .where(inArray(mealLogs.mealId, mealIds))
      .orderBy(asc(mealLogs.id)),
    db.select().from(mealMarks).where(inArray(mealMarks.mealId, mealIds)),
    db
      .select()
      .from(mealMarkItems)
      .where(inArray(mealMarkItems.mealId, mealIds))
      .orderBy(asc(mealMarkItems.id)),
  ]);

  const logs: MealLog[] = logRows.map(({ log, food }) => {
    const typed = {
      kcal: log.kcal,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
    };

    const isMissingFood = log.foodId !== null && !food;

    return {
      id: log.id,
      mealId: log.mealId,
      foodId: log.foodId,
      name: isMissingFood
        ? localizeMessageFor(locale, MEAL_LOG_MESSAGES.MISSING_FOOD_NAME)
        : food
          ? localizeFoodName(food, locale)
          : (log.customName ?? ""),
      isFree: log.foodId === null,
      isArchived: food?.archivedAt != null,
      isMissingFood,
      grams: log.grams,
      typed: log.foodId !== null ? NO_NUMBERS : typed,
      // A missing food has nothing to scale: any numbers stored on the row
      // are kept, otherwise none (not zeros).
      nutrition: resolveLogNutrition(log.grams, food ?? null, typed),
    };
  });

  return {
    logs,
    marks: markRows.map((row) => ({
      mealId: row.mealId,
      achieved: row.achieved,
      note: row.note,
      frozen: frozenRows
        .filter((item) => item.markId === row.id && item.foodId !== null)
        .map((item) => ({
          foodId: item.foodId as number,
          nutrition: {
            kcal: item.kcal,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
          },
        })),
    })),
  };
};

// A log of this trainee: ids from the browser may belong to someone else, to
// a plan that was deleted, or to nothing.
export const findOwnedLog = async (userId: number, logId: number) => {
  const [row] = await db
    .select()
    .from(mealLogs)
    .where(and(eq(mealLogs.id, logId), eq(mealLogs.userId, userId)));

  return row ?? null;
};

// Plan dates from `from` to `to` where the trainee logged or marked something:
// copying over or deleting such a day deletes that too, so the PT is told.
export const listDatesWithLogs = async (
  userId: number,
  from: string,
  to: string,
) => {
  const inRange = and(
    eq(mealPlanDays.userId, userId),
    between(mealPlanDays.date, from, to),
  );
  const [logged, marked] = await Promise.all([
    db
      .select({ date: mealPlanDays.date })
      .from(mealLogs)
      .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealLogs.mealId))
      .innerJoin(mealPlanDays, eq(mealPlanDays.id, mealPlanMeals.dayId))
      .where(inRange),
    db
      .select({ date: mealPlanDays.date })
      .from(mealMarks)
      .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealMarks.mealId))
      .innerJoin(mealPlanDays, eq(mealPlanDays.id, mealPlanMeals.dayId))
      .where(inRange),
  ]);

  return [...new Set([...logged, ...marked].map((row) => row.date))].sort();
};

// Completion status (KAN-119) of each date of the week starting `weekStart`
// for one member: the trainee's and the PT's calendar read the same. Only
// "achieved" marks of meals that are in the member's plan for that week count,
// so a mark whose meal is gone, extra food and note-only marks add nothing.
export const getWeekCompletion = async (
  userId: number,
  weekStart: string,
): Promise<Record<string, DayCompletion>> => {
  const dates = getWeekDates(weekStart);
  const rows = await db
    .select({
      date: mealPlanDays.date,
      mealId: mealPlanMeals.id,
      achieved: mealMarks.achieved,
    })
    .from(mealPlanDays)
    .innerJoin(mealPlanMeals, eq(mealPlanMeals.dayId, mealPlanDays.id))
    .leftJoin(mealMarks, eq(mealMarks.mealId, mealPlanMeals.id))
    .where(
      and(
        eq(mealPlanDays.userId, userId),
        between(mealPlanDays.date, dates[0], dates[dates.length - 1]),
      ),
    );
  const mealIdsByDate = new Map<string, number[]>();

  for (const row of rows) {
    mealIdsByDate.set(row.date, [
      ...(mealIdsByDate.get(row.date) ?? []),
      row.mealId,
    ]);
  }

  return buildWeekCompletion(
    dates,
    mealIdsByDate,
    rows.filter((row) => row.achieved === true).map((row) => row.mealId),
  );
};
