"use server";

import { MEAL_LOG_LIMITS, MEAL_LOG_MESSAGES } from "@pt/contracts";
import {
  addMealLogSchema,
  removeMealLogSchema,
  setMealMarkSchema,
  updateMealLogSchema,
} from "@pt/contracts";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { TIME_ZONE } from "@/constants/time";
import { db } from "@/db";
import {
  foods,
  mealLogs,
  mealMarkItems,
  mealMarks,
  mealPlanItems,
} from "@/db/schema";
import { getFood } from "@/features/foods/services/food-queries";
import { fail, ok, read } from "@/features/meal-plans/services/action-helpers";
import { findOwnedLog } from "@/features/meal-plans/services/meal-log-queries";
import { findOwnedMeal } from "@/features/meal-plans/services/meal-plan-store";
import { nutritionOfFood } from "@/features/meal-plans/utils/meal-log";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireUser } from "@/services/auth-guard";
import { getAdminNutritionPath } from "@/utils/routes";
import { getTodayDate } from "@/utils/week";

const refresh = (userId: number) => {
  revalidatePath(ROUTES.NUTRITION);
  revalidatePath(ROUTES.SUMMARY);
  revalidatePath(getAdminNutritionPath(userId));
  revalidatePath(ROUTES.ADMIN);
};

// The trainee logs what they ate today or earlier, never ahead of time.
const isFutureDay = (date: string) => date > getTodayDate(TIME_ZONE);

// The meal must belong to the trainee's own plan; otherwise null (a foreign
// id, a plan the PT deleted or replaced, or nothing).
const findLoggableMeal = async (userId: number, mealId: number) => {
  const found = await findOwnedMeal(userId, mealId);

  if (!found) {
    return { error: fail(MEAL_LOG_MESSAGES.MEAL_NOT_FOUND) } as const;
  }
  if (isFutureDay(found.day.date)) {
    return { error: fail(MEAL_LOG_MESSAGES.FUTURE_DAY) } as const;
  }
  return { found } as const;
};

export const addMealLogAction = withResultErrorHandling(
  "addMealLog",
  async (input: z.input<typeof addMealLogSchema>) => {
    const user = await requireUser();
    const { data, error } = read(addMealLogSchema, input);

    if (!data) {
      return error;
    }

    const meal = await findLoggableMeal(user.id, data.mealId);

    if ("error" in meal) {
      return meal.error;
    }

    // Library foods are looked up first (archived ones can't be logged anew).
    const food = data.kind === "library" ? await getFood(data.foodId) : null;

    if (data.kind === "library" && !food) {
      return fail(MEAL_LOG_MESSAGES.FOOD_NOT_FOUND);
    }

    // Count and insert in one transaction, so adds that arrive together can't
    // go past the limit.
    const isAdded = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: mealLogs.id })
        .from(mealLogs)
        .where(eq(mealLogs.mealId, data.mealId));

      if (existing.length >= MEAL_LOG_LIMITS.MAX_LOGS_PER_MEAL) {
        return false;
      }
      if (data.kind === "library" && food) {
        // The numbers are stored with the log (KAN-93): editing the food
        // later does not change what was eaten.
        await tx.insert(mealLogs).values({
          userId: user.id,
          mealId: data.mealId,
          foodId: food.id,
          grams: data.grams,
          ...nutritionOfFood(food, data.grams),
        });
      } else if (data.kind === "free") {
        await tx.insert(mealLogs).values({
          userId: user.id,
          mealId: data.mealId,
          customName: data.customName,
          grams: data.grams,
          kcal: data.kcal,
          protein: data.protein,
          carbs: data.carbs,
          fat: data.fat,
        });
      }
      return true;
    });

    if (!isAdded) {
      return fail(MEAL_LOG_MESSAGES.TOO_MANY_LOGS);
    }

    refresh(user.id);
    return ok;
  },
);

export const updateMealLogAction = withResultErrorHandling(
  "updateMealLog",
  async (input: z.input<typeof updateMealLogSchema>) => {
    const user = await requireUser();
    const { data, error } = read(updateMealLogSchema, input);

    if (!data) {
      return error;
    }

    const log = await findOwnedLog(user.id, data.logId);

    if (!log) {
      return fail(MEAL_LOG_MESSAGES.LOG_NOT_FOUND);
    }

    // The meal may be gone (plan replaced): the log went with it, but a
    // stale row must not be editable either.
    const meal = await findLoggableMeal(user.id, log.mealId);

    if ("error" in meal) {
      return meal.error;
    }

    if (log.foodId !== null) {
      // Archived foods may still be edited; a deleted row may not.
      const [food] = await db
        .select({
          protein: foods.protein,
          carbs: foods.carbs,
          fat: foods.fat,
        })
        .from(foods)
        .where(eq(foods.id, log.foodId));

      if (!food) {
        return fail(MEAL_LOG_MESSAGES.FOOD_MISSING);
      }
      if (data.grams <= 0) {
        return fail(MEAL_LOG_MESSAGES.GRAMS_REQUIRED);
      }
      await db
        .update(mealLogs)
        // Recomputed from the library as it is now (KAN-93).
        .set({
          grams: data.grams,
          ...nutritionOfFood(food, data.grams),
          updatedAt: new Date(),
        })
        .where(eq(mealLogs.id, log.id));
    } else {
      if (!data.customName) {
        return fail(MEAL_LOG_MESSAGES.NAME_REQUIRED);
      }
      await db
        .update(mealLogs)
        .set({
          customName: data.customName,
          grams: data.grams,
          kcal: data.kcal,
          protein: data.protein,
          carbs: data.carbs,
          fat: data.fat,
          updatedAt: new Date(),
        })
        .where(eq(mealLogs.id, log.id));
    }

    refresh(user.id);
    return ok;
  },
);

export const removeMealLogAction = withResultErrorHandling(
  "removeMealLog",
  async (input: z.input<typeof removeMealLogSchema>) => {
    const user = await requireUser();
    const { data, error } = read(removeMealLogSchema, input);

    if (!data) {
      return error;
    }

    const log = await findOwnedLog(user.id, data.logId);

    if (!log) {
      return fail(MEAL_LOG_MESSAGES.LOG_NOT_FOUND);
    }
    await db
      .delete(mealLogs)
      .where(and(eq(mealLogs.id, log.id), eq(mealLogs.userId, user.id)));

    refresh(user.id);
    return ok;
  },
);

// S4: "Đạt" and/or a note about which food was short or over. Nothing set
// (not achieved, empty note) removes the mark.
export const setMealMarkAction = withResultErrorHandling(
  "setMealMark",
  async (input: z.input<typeof setMealMarkSchema>) => {
    const user = await requireUser();
    const { data, error } = read(setMealMarkSchema, input);

    if (!data) {
      return error;
    }

    const meal = await findLoggableMeal(user.id, data.mealId);

    if ("error" in meal) {
      return meal.error;
    }

    await db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(mealMarks)
        .where(eq(mealMarks.mealId, data.mealId));

      if (!data.achieved && !data.note) {
        if (previous) {
          await tx
            .delete(mealMarkItems)
            .where(eq(mealMarkItems.markId, previous.id));
        }
        await tx.delete(mealMarks).where(eq(mealMarks.mealId, data.mealId));
        return;
      }

      const [mark] = await tx
        .insert(mealMarks)
        .values({
          mealId: data.mealId,
          userId: user.id,
          achieved: data.achieved,
          note: data.note,
        })
        .onConflictDoUpdate({
          target: mealMarks.mealId,
          set: {
            achieved: data.achieved,
            note: data.note,
            updatedAt: new Date(),
          },
        })
        .returning({ id: mealMarks.id });

      // KAN-93: "Đạt" freezes the planned items as they are now. Turning it on
      // takes a fresh snapshot; a note-only save keeps it; turning it off
      // drops it.
      const wasAchieved = previous?.achieved ?? false;

      if (data.achieved && wasAchieved) {
        return;
      }
      await tx.delete(mealMarkItems).where(eq(mealMarkItems.markId, mark.id));
      if (!data.achieved) {
        return;
      }

      const items = await tx
        .select({
          foodId: mealPlanItems.foodId,
          grams: mealPlanItems.grams,
          protein: foods.protein,
          carbs: foods.carbs,
          fat: foods.fat,
        })
        .from(mealPlanItems)
        .leftJoin(foods, eq(foods.id, mealPlanItems.foodId))
        .where(eq(mealPlanItems.mealId, data.mealId));

      if (items.length) {
        await tx.insert(mealMarkItems).values(
          items.map((item) => ({
            markId: mark.id,
            mealId: data.mealId,
            foodId: item.foodId,
            grams: item.grams,
            // A food row that is gone counts 0 g, as the live plan does.
            ...(item.protein !== null &&
            item.carbs !== null &&
            item.fat !== null
              ? nutritionOfFood(
                  { protein: item.protein, carbs: item.carbs, fat: item.fat },
                  item.grams,
                )
              : { protein: 0, carbs: 0, fat: 0, kcal: 0 }),
          })),
        );
      }
    });

    refresh(user.id);
    return ok;
  },
);
