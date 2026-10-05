import "server-only";

import { and, asc, between, desc, eq, lte } from "drizzle-orm";

import { db } from "@/db";
import { foodEntries, nutritionTargets } from "@/db/schema";
import type {
  FoodEntry,
  NutritionDay,
  NutritionTarget,
} from "@/features/nutrition/types/nutrition";
import {
  findTargetForDate,
  sumEntries,
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
  const [targetRows, entryRows] = await Promise.all([
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
  ]);
  const targets = targetRows.map(toTarget);

  return dates.map((date) => {
    const entries = entryRows.filter((row) => row.date === date).map(toEntry);

    return {
      date,
      target: findTargetForDate(targets, date),
      entries,
      totals: sumEntries(entries),
    };
  });
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
