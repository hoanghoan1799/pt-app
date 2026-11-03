import "server-only";

import { and, asc, between, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  foods,
  mealLogs,
  mealMarkItems,
  mealMarks,
  mealPlanDays,
  mealPlanItems,
  mealPlanMeals,
} from "@/db/schema";

// A transaction or the database itself.
export type Executor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete"
>;

// Every lookup below also checks the member: ids from the browser may belong
// to another member's plan, to a plan that was deleted, or to nothing.
export const findOwnedDay = async (
  userId: number,
  dayId: number,
  executor: Executor = db,
) => {
  const [day] = await executor
    .select()
    .from(mealPlanDays)
    .where(and(eq(mealPlanDays.id, dayId), eq(mealPlanDays.userId, userId)));

  return day ?? null;
};

export const findOwnedMeal = async (
  userId: number,
  mealId: number,
  executor: Executor = db,
) => {
  const [row] = await executor
    .select({ meal: mealPlanMeals, day: mealPlanDays })
    .from(mealPlanMeals)
    .innerJoin(mealPlanDays, eq(mealPlanDays.id, mealPlanMeals.dayId))
    .where(and(eq(mealPlanMeals.id, mealId), eq(mealPlanDays.userId, userId)));

  return row ?? null;
};

export const findOwnedItem = async (
  userId: number,
  itemId: number,
  executor: Executor = db,
) => {
  const [row] = await executor
    .select({ item: mealPlanItems, meal: mealPlanMeals, day: mealPlanDays })
    .from(mealPlanItems)
    .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealPlanItems.mealId))
    .innerJoin(mealPlanDays, eq(mealPlanDays.id, mealPlanMeals.dayId))
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanDays.userId, userId)));

  return row ?? null;
};

export const listDayMeals = (dayId: number, executor: Executor = db) =>
  executor
    .select()
    .from(mealPlanMeals)
    .where(eq(mealPlanMeals.dayId, dayId))
    .orderBy(asc(mealPlanMeals.position), asc(mealPlanMeals.id));

// Items of a meal with their food, archived or not.
export const listMealItems = (mealId: number, executor: Executor = db) =>
  executor
    .select({
      id: mealPlanItems.id,
      foodId: mealPlanItems.foodId,
      grams: mealPlanItems.grams,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
    })
    .from(mealPlanItems)
    .innerJoin(foods, eq(foods.id, mealPlanItems.foodId))
    .where(eq(mealPlanItems.mealId, mealId))
    .orderBy(asc(mealPlanItems.id));

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

// Plan days of a member from `from` to `to` (inclusive), oldest first. The one
// "plan days in a range" query: the week view, the counts, the copy sheet and
// "Áp dụng tuần trước" all read it.
export const listDaysInRange = (
  userId: number,
  from: string,
  to: string,
  executor: Executor = db,
) =>
  executor
    .select()
    .from(mealPlanDays)
    .where(
      and(
        eq(mealPlanDays.userId, userId),
        between(mealPlanDays.date, from, to),
      ),
    )
    .orderBy(asc(mealPlanDays.date));

export interface LoadedPlan {
  meals: (typeof mealPlanMeals.$inferSelect)[];
  items: (typeof mealPlanItems.$inferSelect)[];
}

// Meals and items of several days in two queries; keyed by day id.
export const loadPlans = async (dayIds: number[], executor: Executor) => {
  const plans = new Map<number, LoadedPlan>(
    dayIds.map((id) => [id, { meals: [], items: [] }]),
  );

  if (!dayIds.length) {
    return plans;
  }

  const meals = await executor
    .select()
    .from(mealPlanMeals)
    .where(inArray(mealPlanMeals.dayId, dayIds))
    .orderBy(asc(mealPlanMeals.position), asc(mealPlanMeals.id));
  const items = meals.length
    ? await executor
        .select()
        .from(mealPlanItems)
        .where(
          inArray(
            mealPlanItems.mealId,
            meals.map((meal) => meal.id),
          ),
        )
        .orderBy(asc(mealPlanItems.id))
    : [];

  for (const meal of meals) {
    const plan = plans.get(meal.dayId);

    plan?.meals.push(meal);
    plan?.items.push(...items.filter((item) => item.mealId === meal.id));
  }
  return plans;
};

// Copies a loaded plan to a new day on `date` with one insert for the day, one
// for its meals and one for its foods. Returns null when the member already
// has a plan that day (e.g. created a moment ago): that day is skipped.
export const clonePlan = async (
  plan: LoadedPlan,
  userId: number,
  date: string,
  executor: Executor,
) => {
  const [day] = await executor
    .insert(mealPlanDays)
    .values({ userId, date })
    .onConflictDoNothing()
    .returning({ id: mealPlanDays.id });

  if (!day) {
    return null;
  }
  if (!plan.meals.length) {
    return day.id;
  }

  // RETURNING follows the insert order, so copies line up with the sources.
  const copies = await executor
    .insert(mealPlanMeals)
    .values(
      plan.meals.map((meal) => ({
        dayId: day.id,
        position: meal.position,
        name: meal.name,
        sharePercent: meal.sharePercent,
      })),
    )
    .returning({ id: mealPlanMeals.id });
  const items = plan.items.flatMap((item) => {
    const index = plan.meals.findIndex((meal) => meal.id === item.mealId);

    return index < 0
      ? []
      : [{ mealId: copies[index].id, foodId: item.foodId, grams: item.grams }];
  });

  if (items.length) {
    await executor.insert(mealPlanItems).values(items);
  }
  return day.id;
};
