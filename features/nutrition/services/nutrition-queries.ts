import "server-only";

import { and, asc, between, desc, eq, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  foodEntries,
  foods,
  mealLogs,
  mealMarks,
  mealPlanDays,
  mealPlanItems,
  mealPlanMeals,
  nutritionTargets,
} from "@/db/schema";
import {
  type CountedItem,
  type CountedLog,
  listMealNutrition,
  resolveLogNutrition,
} from "@/features/meal-plans/utils/meal-log";
import type {
  FoodEntry,
  NutritionDay,
  NutritionTarget,
} from "@/features/nutrition/types/nutrition";
import {
  buildNutritionDay,
  findTargetForDate,
} from "@/features/nutrition/utils/nutrition";
import { getWeekDates } from "@/utils/week";

const toTarget = (
  row: typeof nutritionTargets.$inferSelect,
): NutritionTarget => ({
  effectiveFrom: row.effectiveFrom,
  carbs: row.carbs,
  protein: row.protein,
  fat: row.fat,
  note: row.note,
  source: row.source,
});

const toEntry = (row: typeof foodEntries.$inferSelect): FoodEntry => ({
  id: row.id,
  date: row.date,
  meal: row.meal,
  description: row.description,
  carbs: row.carbs,
  protein: row.protein,
  fat: row.fat,
});

export const getNutritionWeek = async (
  userId: number,
  weekStart: string,
): Promise<NutritionDay[]> => {
  const dates = getWeekDates(weekStart);
  const weekEnd = dates[dates.length - 1];
  const [targetRows, entryRows, logRows, itemRows, markRows] =
    await Promise.all([
      db
        .select()
        .from(nutritionTargets)
        .where(
          and(
            eq(nutritionTargets.userId, userId),
            lte(nutritionTargets.effectiveFrom, weekEnd),
          ),
        )
        .orderBy(asc(nutritionTargets.effectiveFrom)),
      db
        .select()
        .from(foodEntries)
        .where(
          and(
            eq(foodEntries.userId, userId),
            between(foodEntries.date, dates[0], weekEnd),
          ),
        )
        .orderBy(asc(foodEntries.id)),
      // Foods the trainee logged in the meal plan (KAN-71), by plan day.
      db
        .select({
          date: mealPlanDays.date,
          mealId: mealLogs.mealId,
          foodId: mealLogs.foodId,
          grams: mealLogs.grams,
          kcal: mealLogs.kcal,
          protein: mealLogs.protein,
          carbs: mealLogs.carbs,
          fat: mealLogs.fat,
          food: {
            protein: foods.protein,
            carbs: foods.carbs,
            fat: foods.fat,
          },
        })
        .from(mealLogs)
        .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealLogs.mealId))
        .innerJoin(mealPlanDays, eq(mealPlanDays.id, mealPlanMeals.dayId))
        .leftJoin(foods, eq(foods.id, mealLogs.foodId))
        .where(
          and(
            eq(mealLogs.userId, userId),
            between(mealPlanDays.date, dates[0], weekEnd),
          ),
        ),
      // The plan's items per meal: a meal marked "Đạt" counts them (KAN-87).
      db
        .select({
          date: mealPlanDays.date,
          mealId: mealPlanItems.mealId,
          foodId: mealPlanItems.foodId,
          grams: mealPlanItems.grams,
          food: {
            protein: foods.protein,
            carbs: foods.carbs,
            fat: foods.fat,
          },
        })
        .from(mealPlanItems)
        .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealPlanItems.mealId))
        .innerJoin(mealPlanDays, eq(mealPlanDays.id, mealPlanMeals.dayId))
        .leftJoin(foods, eq(foods.id, mealPlanItems.foodId))
        .where(
          and(
            eq(mealPlanDays.userId, userId),
            between(mealPlanDays.date, dates[0], weekEnd),
          ),
        ),
      db
        .select({ mealId: mealMarks.mealId })
        .from(mealMarks)
        .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealMarks.mealId))
        .innerJoin(mealPlanDays, eq(mealPlanDays.id, mealPlanMeals.dayId))
        .where(
          and(
            eq(mealMarks.userId, userId),
            eq(mealMarks.achieved, true),
            between(mealPlanDays.date, dates[0], weekEnd),
          ),
        ),
    ]);
  const achievedMealIds = new Set(markRows.map((row) => row.mealId));
  const mealIdsByDate = new Map<string, Set<number>>();

  for (const row of [...logRows, ...itemRows]) {
    mealIdsByDate.set(
      row.date,
      (mealIdsByDate.get(row.date) ?? new Set()).add(row.mealId),
    );
  }

  // What counts as eaten on one day, per meal (the same rule as the meal cards).
  const getMealParts = (date: string) =>
    [...(mealIdsByDate.get(date) ?? [])].flatMap((mealId) => {
      const items: CountedItem[] = itemRows
        .filter((row) => row.mealId === mealId)
        .map((row) => ({
          foodId: row.foodId,
          grams: row.grams,
          // A deleted food counts 0 g.
          food: row.food && row.food.protein !== null ? row.food : null,
        }));
      const logs: CountedLog[] = logRows
        .filter((row) => row.mealId === mealId)
        .map((row) => ({
          foodId: row.foodId,
          // Same 4/4/9 numbers as the meal log screens; a vanished food
          // resolves to nothing.
          nutrition: resolveLogNutrition(
            row.grams,
            row.foodId !== null ? row.food : null,
            row,
          ),
        }));

      return listMealNutrition(items, logs, achievedMealIds.has(mealId));
    });
  const targets = targetRows.map(toTarget);

  return dates.map((date) =>
    buildNutritionDay(
      date,
      findTargetForDate(targets, date),
      entryRows.filter((row) => row.date === date).map(toEntry),
      // A part with no numbers (or a vanished food) counts as logged, 0 g.
      getMealParts(date).map(
        (part) => part ?? { kcal: 0, carbs: 0, protein: 0, fat: 0 },
      ),
    ),
  );
};

// The most recent target, used to pre-fill the admin's form.
export const getLatestTarget = async (userId: number) => {
  const [row] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .orderBy(desc(nutritionTargets.effectiveFrom))
    .limit(1);

  return row ? toTarget(row) : null;
};

// Every target that started on or before `date`, oldest first. Resolve a day
// with findTargetForDate; the week view and the meal plan share this rule.
export const listTargetsUpTo = async (userId: number, date: string) => {
  const rows = await db
    .select()
    .from(nutritionTargets)
    .where(
      and(
        eq(nutritionTargets.userId, userId),
        lte(nutritionTargets.effectiveFrom, date),
      ),
    )
    .orderBy(asc(nutritionTargets.effectiveFrom));

  return rows.map(toTarget);
};

// The target that applies on `date`: the latest one that started on or before
// it.
export const getTargetForDate = async (userId: number, date: string) =>
  findTargetForDate(await listTargetsUpTo(userId, date), date);
