"use server";

import {
  FOOD_ERROR_CODES,
  FOOD_MESSAGES,
  foodFormSchema,
  foodIdSchema,
  toFieldErrors,
} from "@pt/contracts";
import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
import { requireSuperAdmin } from "@/services/auth-guard";
import type { ActionResult } from "@/types/error";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
} from "@/utils/form";

const revalidateFoods = () => {
  revalidatePath(ROUTES.ADMIN_FOODS, "layout");
  revalidatePath(ROUTES.FOODS, "layout");
};

// Validates the form (so the messages stay the web's) and returns the text the
// user typed: the API takes the same form-text formats and checks them again.
const readFoodForm = (formData: FormData) => {
  const values = getFormValues(formData);
  const parsed = foodFormSchema.safeParse(values);

  if (!parsed.success) {
    return {
      error: createErrorState(FOOD_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      }),
    } as const;
  }

  return {
    body: {
      name: values.name ?? "",
      group: values.group ?? "",
      state: values.state,
      kcal: values.kcal ?? "",
      protein: values.protein ?? "",
      carbs: values.carbs ?? "",
      fat: values.fat ?? "",
      fiber: values.fiber,
      servingLabel: values.servingLabel,
      servingGrams: values.servingGrams,
      nameEn: values.nameEn,
      nameZh: values.nameZh,
      source: values.source,
      confirmed: values.confirmed,
    },
  } as const;
};

const nameTakenState = () =>
  createErrorState(FOOD_MESSAGES.NAME_TAKEN, {
    fieldErrors: { name: FOOD_MESSAGES.NAME_TAKEN },
  });

export const createFoodAction = withFormErrorHandling(
  "createFood",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireSuperAdmin();

    const { error, body } = readFoodForm(formData);

    if (!body) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/foods", { body }),
    );

    if (!outcome.ok) {
      return outcome.error.code === FOOD_ERROR_CODES.NAME_TAKEN
        ? nameTakenState()
        : apiErrorToFormState(outcome.error);
    }
    revalidateFoods();
    return createSuccessState(FOOD_MESSAGES.CREATED);
  },
);

export const updateFoodAction = withFormErrorHandling(
  "updateFood",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireSuperAdmin();

    const id = foodIdSchema.safeParse(formData.get("id"));

    if (!id.success) {
      return createErrorState(FOOD_MESSAGES.NOT_FOUND);
    }

    const { error, body } = readFoodForm(formData);

    if (!body) {
      return error;
    }

    const outcome = await tryApi("admin", (api) =>
      api.PATCH("/v1/foods/{id}", {
        params: { path: { id: String(id.data) } },
        body,
      }),
    );

    if (!outcome.ok) {
      if (outcome.error.code === FOOD_ERROR_CODES.NAME_TAKEN) {
        return nameTakenState();
      }
      // Archived or removed since the page was opened.
      return outcome.error.code === FOOD_ERROR_CODES.NOT_FOUND
        ? createErrorState(FOOD_MESSAGES.NOT_FOUND)
        : apiErrorToFormState(outcome.error);
    }
    revalidateFoods();
    return createSuccessState(FOOD_MESSAGES.UPDATED);
  },
);

// "Xóa" archives: the row stays so later meal plans keep their numbers.
export const archiveFoodAction = withResultErrorHandling(
  "archiveFood",
  async (foodId: number): Promise<ActionResult> => {
    await requireSuperAdmin();

    const id = foodIdSchema.safeParse(foodId);

    if (!id.success) {
      return { status: "error", message: FOOD_MESSAGES.NOT_FOUND };
    }

    const outcome = await tryApi("admin", (api) =>
      api.DELETE("/v1/foods/{id}", {
        params: { path: { id: String(id.data) } },
      }),
    );

    if (!outcome.ok) {
      return {
        status: "error",
        message:
          outcome.error.code === FOOD_ERROR_CODES.NOT_FOUND
            ? FOOD_MESSAGES.NOT_FOUND
            : outcome.error.message,
      };
    }
    revalidateFoods();
    return { status: "success" };
  },
);
