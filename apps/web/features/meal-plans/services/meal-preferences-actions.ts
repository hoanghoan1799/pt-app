"use server";

import {
  MEAL_PLAN_MESSAGES,
  mealPreferencesSchema,
  toFieldErrors,
} from "@pt/contracts";
import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { withFormErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
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
    const values = getFormValues(formData);
    const parsed = mealPreferencesSchema.safeParse(values);

    if (!parsed.success) {
      return createErrorState(MEAL_PLAN_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
        values,
      });
    }

    const outcome = await tryApi("user", (api) =>
      api.PUT("/v1/me/meal-preferences", {
        body: { mealCount: values.mealCount, foodNote: values.foodNote },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error, { values });
    }
    revalidatePath(ROUTES.NUTRITION);
    revalidatePath(getAdminNutritionPath(user.id));
    return createSuccessState(MEAL_PLAN_MESSAGES.PREFERENCES_SAVED);
  },
);
