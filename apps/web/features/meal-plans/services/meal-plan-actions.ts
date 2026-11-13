"use server";

import {
  addItemSchema,
  addMealSchema,
  applyLastWeekSchema,
  autoSolveSchema,
  copyMealPlanDaySchema,
  copyMealPlanMonthInfoSchema,
  createDayPlanSchema,
  deleteDayPlanSchema,
  removeItemSchema,
  removeMealSchema,
  renameMealSchema,
  reorderMealsSchema,
  setMealSharesSchema,
  updateItemGramsSchema,
} from "@pt/contracts";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import {
  fail,
  read,
  toResult,
} from "@/features/meal-plans/services/action-helpers";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { requireAdmin } from "@/services/auth-guard";
import type { ActionErrorResult, ActionResult } from "@/types/error";
import { getAdminNutritionPath } from "@/utils/routes";

// The API checks the PT's workspace, the hidden state, the limits and the
// rules (one plan per day, 10 meals, 100 % shares...) and answers with the
// text shown to the PT. Each action only validates its input, calls the API
// and revalidates the trainee's page.

const refresh = (userId: number) => {
  revalidatePath(getAdminNutritionPath(userId));
};

// Refreshes the page only when the API accepted the change.
const done = (userId: number, result: ActionResult): ActionResult => {
  if (result.status === "success") {
    refresh(userId);
  }
  return result;
};

export type CopyMonthInfoResult =
  | { status: "success"; planDates: string[]; logDates: string[] }
  | ActionErrorResult;

export type CopyResult =
  { status: "success"; copied: number; skipped: number } | ActionErrorResult;

// Creates the plan of a day with the default meals: the trainee's request
// when there is one, else 3 (Q2).
export const createDayPlanAction = withResultErrorHandling(
  "createDayPlan",
  async (input: z.input<typeof createDayPlanSchema>) => {
    await requireAdmin();

    const { data, error } = read(createDayPlanSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/trainees/{userId}/meal-plan-days", {
        params: { path: { userId: data.userId } },
        body: { date: data.date },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

export const deleteDayPlanAction = withResultErrorHandling(
  "deleteDayPlan",
  async (input: z.input<typeof deleteDayPlanSchema>) => {
    await requireAdmin();

    const { data, error } = read(deleteDayPlanSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.DELETE("/v1/meal-plan-days/{dayId}", {
        params: { path: { dayId: data.dayId } },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

export const addMealAction = withResultErrorHandling(
  "addMeal",
  async (input: z.input<typeof addMealSchema>) => {
    await requireAdmin();

    const { data, error } = read(addMealSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/meal-plan-days/{dayId}/meals", {
        params: { path: { dayId: data.dayId } },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

export const removeMealAction = withResultErrorHandling(
  "removeMeal",
  async (input: z.input<typeof removeMealSchema>) => {
    await requireAdmin();

    const { data, error } = read(removeMealSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.DELETE("/v1/meals/{mealId}", {
        params: { path: { mealId: data.mealId } },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

export const renameMealAction = withResultErrorHandling(
  "renameMeal",
  async (input: z.input<typeof renameMealSchema>) => {
    await requireAdmin();

    const { data, error } = read(renameMealSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.PATCH("/v1/meals/{mealId}", {
        params: { path: { mealId: data.mealId } },
        body: { name: data.name },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

// `mealIds` is the new order; it must list exactly the meals of the day.
export const reorderMealsAction = withResultErrorHandling(
  "reorderMeals",
  async (input: z.input<typeof reorderMealsSchema>) => {
    await requireAdmin();

    const { data, error } = read(reorderMealsSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.PUT("/v1/meal-plan-days/{dayId}/meals/order", {
        params: { path: { dayId: data.dayId } },
        body: { mealIds: data.mealIds },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

// Q4: a percent per meal, total 100; `shares: null` goes back to equal.
export const setMealSharesAction = withResultErrorHandling(
  "setMealShares",
  async (input: z.input<typeof setMealSharesSchema>) => {
    await requireAdmin();

    const { data, error } = read(setMealSharesSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.PUT("/v1/meal-plan-days/{dayId}/meals/shares", {
        params: { path: { dayId: data.dayId } },
        body: { shares: data.shares },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

export const addItemAction = withResultErrorHandling(
  "addMealItem",
  async (input: z.input<typeof addItemSchema>) => {
    await requireAdmin();

    const { data, error } = read(addItemSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/meals/{mealId}/items", {
        params: { path: { mealId: data.mealId } },
        body: { foodId: data.foodId, grams: data.grams },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

export const removeItemAction = withResultErrorHandling(
  "removeMealItem",
  async (input: z.input<typeof removeItemSchema>) => {
    await requireAdmin();

    const { data, error } = read(removeItemSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.DELETE("/v1/meal-items/{itemId}", {
        params: { path: { itemId: data.itemId } },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

export const updateItemGramsAction = withResultErrorHandling(
  "updateMealItemGrams",
  async (input: z.input<typeof updateItemGramsSchema>) => {
    await requireAdmin();

    const { data, error } = read(updateItemGramsSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.PATCH("/v1/meal-items/{itemId}", {
        params: { path: { itemId: data.itemId } },
        body: { grams: data.grams },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

// Q5: sets the grams of the meal's foods (except the fixed ones) so the meal
// reaches its share of the day target. Rounded to 5 g; the gap it leaves is
// worked out again on screen from the saved grams.
export const autoSolveMealAction = withResultErrorHandling(
  "autoSolveMeal",
  async (input: z.input<typeof autoSolveSchema>) => {
    await requireAdmin();

    const { data, error } = read(autoSolveSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/meals/{mealId}/auto-solve", {
        params: { path: { mealId: data.mealId } },
        body: { fixedItemIds: data.fixedItemIds },
      }),
    );

    return done(data.userId, toResult(outcome));
  },
);

// Copies a day to the chosen dates; a date that already has a plan gets it
// replaced (the screen says so before the PT confirms).
export const copyDayAction = withResultErrorHandling(
  "copyDayPlan",
  async (input: z.input<typeof copyMealPlanDaySchema>): Promise<CopyResult> => {
    await requireAdmin();

    const { data, error } = read(copyMealPlanDaySchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/trainees/{userId}/meal-plan-days/copy", {
        params: { path: { userId: data.userId } },
        body: { dayId: data.dayId, dates: data.dates },
      }),
    );

    if (!outcome.ok) {
      return fail(outcome.error.message);
    }
    refresh(data.userId);
    return { status: "success", ...outcome.data };
  },
);

// KAN-122: the copy sheet's month picker marks days that already have a plan
// (and warns about logs) beyond the weeks the page loaded.
export const getCopyMonthInfoAction = withResultErrorHandling(
  "getCopyMonthInfo",
  async (
    input: z.input<typeof copyMealPlanMonthInfoSchema>,
  ): Promise<CopyMonthInfoResult> => {
    await requireAdmin();

    const { data, error } = read(copyMealPlanMonthInfoSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.GET("/v1/trainees/{userId}/meal-plan-days/copy-info", {
        params: {
          path: { userId: data.userId },
          query: { from: data.from, to: data.to },
        },
      }),
    );

    if (!outcome.ok) {
      return fail(outcome.error.message);
    }
    return {
      status: "success",
      planDates: outcome.data.planDates,
      logDates: outcome.data.logDates,
    };
  },
);

// R2: copies last week's plans to the same weekdays of `weekStart`'s week.
// Only the PT's click does this, and a day that already has a plan keeps it.
export const applyLastWeekAction = withResultErrorHandling(
  "applyLastWeek",
  async (input: z.input<typeof applyLastWeekSchema>): Promise<CopyResult> => {
    await requireAdmin();

    const { data, error } = read(applyLastWeekSchema, input);

    if (!data) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/trainees/{userId}/meal-plan-days/apply-last-week", {
        params: { path: { userId: data.userId } },
        body: { weekStart: data.weekStart },
      }),
    );

    if (!outcome.ok) {
      return fail(outcome.error.message);
    }
    refresh(data.userId);
    return { status: "success", ...outcome.data };
  },
);
