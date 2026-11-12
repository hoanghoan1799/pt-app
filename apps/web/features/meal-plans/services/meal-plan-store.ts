import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  mealLogs,
  mealMarkItems,
  mealMarks,
  mealPlanDays,
  mealPlanItems,
  mealPlanMeals,
} from "@/db/schema";

// TRANSITION (integration branch feat/web-on-api): meal plans are read and
// written through the API now. Only the legacy cleanup that member deletion
// (features/members, not switched yet) still runs against SQLite stays here;
// it goes with that area.

// A transaction or the database itself.
export type Executor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete"
>;

// Children first: foreign keys are not enforced (D10).
export const deleteMeals = async (mealIds: number[], executor: Executor) => {
  if (!mealIds.length) {
    return;
  }
  await executor
    .delete(mealPlanItems)
    .where(inArray(mealPlanItems.mealId, mealIds));
  // The trainee's logs and marks go with the meal (KAN-71).
  await executor.delete(mealLogs).where(inArray(mealLogs.mealId, mealIds));
  await executor.delete(mealMarks).where(inArray(mealMarks.mealId, mealIds));
  // The frozen "Đạt" items go with the mark (KAN-93).
  await executor
    .delete(mealMarkItems)
    .where(inArray(mealMarkItems.mealId, mealIds));
  await executor
    .delete(mealPlanMeals)
    .where(inArray(mealPlanMeals.id, mealIds));
};

export const deleteDays = async (dayIds: number[], executor: Executor) => {
  if (!dayIds.length) {
    return;
  }

  const meals = await executor
    .select({ id: mealPlanMeals.id })
    .from(mealPlanMeals)
    .where(inArray(mealPlanMeals.dayId, dayIds));

  await deleteMeals(
    meals.map((meal) => meal.id),
    executor,
  );
  await executor.delete(mealPlanDays).where(inArray(mealPlanDays.id, dayIds));
};
