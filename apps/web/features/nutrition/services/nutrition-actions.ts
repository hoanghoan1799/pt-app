"use server";

import {
  bodyProfileSchema,
  foodEntrySchema,
  myBodyProfileSchema,
  targetSchema,
  toFieldErrors,
  weightLogSchema,
} from "@pt/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { TIME_ZONE } from "@/constants/time";
import { NUTRITION_MESSAGES } from "@/features/nutrition/constants/nutrition";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { callApi, tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";
import type { ActionResult } from "@/types/error";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
} from "@/utils/form";
import { getAdminNutritionPath } from "@/utils/routes";
import { getTodayDate } from "@/utils/week";

const revalidateNutrition = (userId: number) => {
  revalidatePath(ROUTES.NUTRITION);
  revalidatePath(ROUTES.SUMMARY);
  revalidatePath(getAdminNutritionPath(userId));
  revalidatePath(ROUTES.ADMIN);
};

// The API takes the form's own text ("72,5") and checks it again; the Zod
// parse in each action keeps the web's messages and field errors.

// Admin: sets the daily target from today on; earlier days keep theirs.
export const saveNutritionTargetAction = withFormErrorHandling(
  "saveNutritionTarget",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const values = getFormValues(formData);
    const parsed = targetSchema.safeParse(values);

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { userId } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.PUT("/v1/trainees/{userId}/nutrition-target", {
        params: { path: { userId: userId } },
        body: {
          carbs: values.carbs ?? "",
          protein: values.protein ?? "",
          fat: values.fat ?? "",
          note: values.note,
        },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error);
    }
    revalidateNutrition(userId);
    return createSuccessState(NUTRITION_MESSAGES.TARGET_SAVED);
  },
);

// User: logs (or edits) a meal for today or an earlier day.
export const saveFoodEntryAction = withFormErrorHandling(
  "saveFoodEntry",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const user = await requireUser();
    const values = getFormValues(formData);
    const parsed = foodEntrySchema.safeParse(values);

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { entryId } = parsed.data;
    const body = {
      date: parsed.data.date,
      meal: parsed.data.meal,
      description: values.description,
      carbs: values.carbs,
      protein: values.protein,
      fat: values.fat,
    };
    // The API refuses an empty entry and a future date with the web's messages.
    const outcome = entryId
      ? await tryApi("user", (api) =>
          api.PUT("/v1/me/food-entries/{id}", {
            params: { path: { id: entryId } },
            body,
          }),
        )
      : await tryApi("user", (api) =>
          api.POST("/v1/me/food-entries", { body }),
        );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error);
    }
    revalidateNutrition(user.id);
    return createSuccessState(
      entryId
        ? NUTRITION_MESSAGES.ENTRY_UPDATED
        : NUTRITION_MESSAGES.ENTRY_CREATED,
    );
  },
);

export const deleteFoodEntryAction = withResultErrorHandling(
  "deleteFoodEntry",
  async (entryId: number): Promise<ActionResult> => {
    const user = await requireUser();
    const id = z.number().int().positive().parse(entryId);

    // No error when the entry is already gone.
    await callApi("user", (api) =>
      api.DELETE("/v1/me/food-entries/{id}", {
        params: { path: { id: id } },
      }),
    );

    revalidateNutrition(user.id);
    return { status: "success" };
  },
);

// Admin: saves the body measurements and, unless unticked, replaces today's
// target with the one computed from the TDEE (keeping the coach note).
export const saveBodyProfileAction = withFormErrorHandling(
  "saveBodyProfile",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const values = getFormValues(formData);
    const parsed = bodyProfileSchema.safeParse(values);

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { userId, applyToTarget } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.PUT("/v1/trainees/{userId}/body-profile", {
        params: { path: { userId: userId } },
        body: {
          sex: parsed.data.sex,
          age: values.age ?? "",
          heightCm: values.heightCm ?? "",
          weightKg: values.weightKg ?? "",
          activityLevel: parsed.data.activityLevel,
          kcalAdjustment: values.kcalAdjustment ?? "",
          proteinPerKg: values.proteinPerKg ?? "",
          applyToTarget,
        },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error);
    }
    revalidateNutrition(userId);
    return createSuccessState(
      outcome.data.targetApplied
        ? NUTRITION_MESSAGES.PROFILE_APPLIED
        : NUTRITION_MESSAGES.PROFILE_SAVED,
    );
  },
);

// User: updates their own measurements; the target follows the TDEE unless
// the admin set it by hand.
export const saveMyBodyProfileAction = withFormErrorHandling(
  "saveMyBodyProfile",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const user = await requireUser();
    const values = getFormValues(formData);
    const parsed = myBodyProfileSchema.safeParse(values);

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const outcome = await tryApi("user", (api) =>
      api.PUT("/v1/me/body-profile", {
        body: {
          sex: parsed.data.sex,
          age: values.age ?? "",
          heightCm: values.heightCm ?? "",
          weightKg: values.weightKg ?? "",
          activityLevel: parsed.data.activityLevel,
          goal: parsed.data.goal,
        },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error);
    }
    revalidateNutrition(user.id);
    return createSuccessState(
      outcome.data.targetApplied
        ? NUTRITION_MESSAGES.PROFILE_APPLIED
        : NUTRITION_MESSAGES.PROFILE_KEPT_MANUAL,
    );
  },
);

// User: records today's weight (one weigh-in per day; saving again replaces it).
export const logWeightAction = withFormErrorHandling(
  "logWeight",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const user = await requireUser();
    const values = getFormValues(formData);
    const parsed = weightLogSchema.safeParse(values);

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const outcome = await tryApi("user", (api) =>
      api.PUT("/v1/me/weight-logs/{date}", {
        params: { path: { date: getTodayDate(TIME_ZONE) } },
        body: { weightKg: values.weightKg ?? "" },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error);
    }
    revalidateNutrition(user.id);
    revalidatePath(ROUTES.SUMMARY);
    return createSuccessState(
      outcome.data.targetApplied
        ? NUTRITION_MESSAGES.WEIGHT_SAVED_TARGET
        : NUTRITION_MESSAGES.WEIGHT_SAVED,
    );
  },
);
