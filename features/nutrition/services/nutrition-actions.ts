"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { TIME_ZONE } from "@/constants/time";
import { db } from "@/db";
import { bodyProfiles, foodEntries, nutritionTargets } from "@/db/schema";
import { NUTRITION_MESSAGES } from "@/features/nutrition/constants/nutrition";
import { getLatestTarget } from "@/features/nutrition/services/nutrition-queries";
import {
  bodyProfileSchema,
  foodEntrySchema,
  targetSchema,
} from "@/features/nutrition/services/nutrition-schemas";
import {
  calculateEnergyPlan,
  getBirthYear,
} from "@/features/nutrition/utils/energy";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";
import type { ActionResult } from "@/types/error";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
  toFieldErrors,
} from "@/utils/form";
import { getAdminNutritionPath } from "@/utils/routes";
import { getTodayDate } from "@/utils/week";

const revalidateNutrition = (userId: number) => {
  revalidatePath(ROUTES.NUTRITION);
  revalidatePath(getAdminNutritionPath(userId));
  revalidatePath(ROUTES.ADMIN);
};

// Admin: sets the daily target from today on; earlier days keep theirs.
export const saveNutritionTargetAction = withFormErrorHandling(
  "saveNutritionTarget",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const parsed = targetSchema.safeParse(getFormValues(formData));

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { userId, carbs, protein, fat, note } = parsed.data;
    const effectiveFrom = getTodayDate(TIME_ZONE);

    await db
      .insert(nutritionTargets)
      .values({ userId, effectiveFrom, carbs, protein, fat, note })
      .onConflictDoUpdate({
        target: [nutritionTargets.userId, nutritionTargets.effectiveFrom],
        set: { carbs, protein, fat, note },
      });

    revalidateNutrition(userId);
    return createSuccessState(NUTRITION_MESSAGES.TARGET_SAVED);
  },
);

// User: logs (or edits) a meal for today or an earlier day.
export const saveFoodEntryAction = withFormErrorHandling(
  "saveFoodEntry",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const user = await requireUser();
    const parsed = foodEntrySchema.safeParse(getFormValues(formData));

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { entryId, date, ...values } = parsed.data;
    const hasAmount = [values.carbs, values.protein, values.fat].some(
      (grams) => grams !== null,
    );

    if (!values.description && !hasAmount) {
      return createErrorState(NUTRITION_MESSAGES.ENTRY_EMPTY);
    }
    if (date > getTodayDate(TIME_ZONE)) {
      return createErrorState(NUTRITION_MESSAGES.FUTURE_DATE);
    }

    if (entryId) {
      const updated = await db
        .update(foodEntries)
        .set(values)
        .where(
          and(eq(foodEntries.id, entryId), eq(foodEntries.userId, user.id)),
        )
        .returning({ id: foodEntries.id });

      if (!updated.length) {
        return createErrorState(NUTRITION_MESSAGES.ENTRY_NOT_FOUND);
      }
      revalidateNutrition(user.id);
      return createSuccessState(NUTRITION_MESSAGES.ENTRY_UPDATED);
    }

    await db.insert(foodEntries).values({ ...values, date, userId: user.id });
    revalidateNutrition(user.id);
    return createSuccessState(NUTRITION_MESSAGES.ENTRY_CREATED);
  },
);

export const deleteFoodEntryAction = withResultErrorHandling(
  "deleteFoodEntry",
  async (entryId: number): Promise<ActionResult> => {
    const user = await requireUser();
    const id = z.number().int().positive().parse(entryId);

    await db
      .delete(foodEntries)
      .where(and(eq(foodEntries.id, id), eq(foodEntries.userId, user.id)));

    revalidateNutrition(user.id);
    return { status: "success" };
  },
);

// Admin: saves the body measurements and, unless unticked, replaces today's
// macro target with the one computed from the TDEE (keeping the coach note).
export const saveBodyProfileAction = withFormErrorHandling(
  "saveBodyProfile",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const parsed = bodyProfileSchema.safeParse(getFormValues(formData));

    if (!parsed.success) {
      return createErrorState(NUTRITION_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { userId, age, applyToTarget, ...measurements } = parsed.data;
    const today = getTodayDate(TIME_ZONE);
    const profile = { ...measurements, birthYear: getBirthYear(age, today) };

    await db
      .insert(bodyProfiles)
      .values({ userId, ...profile })
      .onConflictDoUpdate({
        target: bodyProfiles.userId,
        set: { ...profile, updatedAt: new Date() },
      });

    if (applyToTarget) {
      const { macros } = calculateEnergyPlan(profile, today);
      const note = (await getLatestTarget(userId))?.note ?? "";

      await db
        .insert(nutritionTargets)
        .values({ userId, effectiveFrom: today, ...macros, note })
        .onConflictDoUpdate({
          target: [nutritionTargets.userId, nutritionTargets.effectiveFrom],
          set: macros,
        });
    }

    revalidateNutrition(userId);
    return createSuccessState(
      applyToTarget
        ? NUTRITION_MESSAGES.PROFILE_APPLIED
        : NUTRITION_MESSAGES.PROFILE_SAVED,
    );
  },
);
