"use server";

import { MEAL_PLAN_MESSAGES } from "@pt/contracts";
import { mealPreferencesSchema } from "@pt/contracts";
import { toFieldErrors } from "@pt/contracts";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { db } from "@/db";
import { users } from "@/db/schema";
import { withFormErrorHandling } from "@/services/action-errors";
import { requireUser } from "@/services/auth-guard";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
} from "@/utils/form";
import { getAdminNutritionPath } from "@/utils/routes";

// User: saves their own request for the PT (Q1): meals per day and foods they
// like or avoid. Both may be cleared.
export const saveMealPreferencesAction = withFormErrorHandling(
  "saveMealPreferences",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const user = await requireUser();
    const parsed = mealPreferencesSchema.safeParse(getFormValues(formData));

    if (!parsed.success) {
      return createErrorState(MEAL_PLAN_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
        values: getFormValues(formData),
      });
    }

    await db
      .update(users)
      .set({
        preferredMealCount: parsed.data.mealCount,
        foodNote: parsed.data.foodNote,
      })
      .where(eq(users.id, user.id));

    revalidatePath(ROUTES.NUTRITION);
    revalidatePath(getAdminNutritionPath(user.id));
    return createSuccessState(MEAL_PLAN_MESSAGES.PREFERENCES_SAVED);
  },
);
