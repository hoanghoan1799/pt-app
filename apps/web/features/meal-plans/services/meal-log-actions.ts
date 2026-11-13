"use server";

import {
  addMealLogSchema,
  removeMealLogSchema,
  setMealMarkSchema,
  updateMealLogSchema,
} from "@pt/contracts";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { read, toResult } from "@/features/meal-plans/services/action-helpers";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { requireUser } from "@/services/auth-guard";
import type { ActionResult } from "@/types/error";
import { getAdminNutritionPath } from "@/utils/routes";

// The API decides what the trainee may log: the meal must be in their own
// plan, not on a future day, the library food must be active, at most 30 logs
// per meal. It also stores the numbers with the log (KAN-93) and freezes the
// planned items when a meal is marked "Đạt". These actions validate the
// input, call it and revalidate where the web always did.

const refresh = (userId: number) => {
  revalidatePath(ROUTES.NUTRITION);
  revalidatePath(ROUTES.SUMMARY);
  revalidatePath(getAdminNutritionPath(userId));
  revalidatePath(ROUTES.ADMIN);
};

const done = (userId: number, result: ActionResult): ActionResult => {
  if (result.status === "success") {
    refresh(userId);
  }
  return result;
};

export const addMealLogAction = withResultErrorHandling(
  "addMealLog",
  async (input: z.input<typeof addMealLogSchema>) => {
    const user = await requireUser();
    const { data, error } = read(addMealLogSchema, input);

    if (!data) {
      return error;
    }

    const { mealId, ...body } = data;
    const outcome = await tryApi("user", (api) =>
      api.POST("/v1/me/meals/{mealId}/logs", {
        params: { path: { mealId: mealId } },
        body,
      }),
    );

    return done(user.id, toResult(outcome));
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

    const { logId, ...body } = data;
    const outcome = await tryApi("user", (api) =>
      api.PATCH("/v1/me/meal-logs/{id}", {
        params: { path: { id: logId } },
        body,
      }),
    );

    return done(user.id, toResult(outcome));
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

    const outcome = await tryApi("user", (api) =>
      api.DELETE("/v1/me/meal-logs/{id}", {
        params: { path: { id: data.logId } },
      }),
    );

    return done(user.id, toResult(outcome));
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

    const outcome = await tryApi("user", (api) =>
      api.PUT("/v1/me/meals/{mealId}/mark", {
        params: { path: { mealId: data.mealId } },
        body: { achieved: data.achieved, note: data.note },
      }),
    );

    return done(user.id, toResult(outcome));
  },
);
