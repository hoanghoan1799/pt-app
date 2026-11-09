"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { db } from "@/db";
import { foods } from "@/db/schema";
import { FOOD_MESSAGES } from "@/features/foods/constants/foods";
import { findActiveFoodByNameKey } from "@/features/foods/services/food-queries";
import {
  foodFormSchema,
  foodIdSchema,
} from "@/features/foods/services/food-schemas";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { requireSuperAdmin } from "@/services/auth-guard";
import type { ActionResult } from "@/types/error";
import type { FormState } from "@/types/form";
import { isUniqueViolation } from "@/utils/errors";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
  toFieldErrors,
} from "@/utils/form";
import { toNameKey } from "@/utils/name";

const revalidateFoods = () => {
  revalidatePath(ROUTES.ADMIN_FOODS, "layout");
  revalidatePath(ROUTES.FOODS, "layout");
};

// Validates the form, drops the "I checked" box (it is not stored) and adds
// the search key. Returns the error state when the input is not acceptable.
const readFoodForm = (formData: FormData) => {
  const parsed = foodFormSchema.safeParse(getFormValues(formData));

  if (!parsed.success) {
    return {
      error: createErrorState(FOOD_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      }),
    } as const;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- not stored
  const { confirmed, ...values } = parsed.data;

  return {
    values: {
      ...values,
      // Empty serving fields are stored as null, not as an empty label.
      servingLabel: values.servingLabel || null,
      // An empty translation falls back to the starter map or the name.
      nameEn: values.nameEn || null,
      nameZh: values.nameZh || null,
      nameKey: toNameKey(values.name),
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

    const { error, values } = readFoodForm(formData);

    if (!values) {
      return error;
    }
    if (await findActiveFoodByNameKey(values.nameKey)) {
      return nameTakenState();
    }

    try {
      await db.insert(foods).values(values);
    } catch (error) {
      // Two saves with the same name raced past the check above.
      if (isUniqueViolation(error)) {
        return nameTakenState();
      }
      throw error;
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

    const { error, values } = readFoodForm(formData);

    if (!values) {
      return error;
    }
    if (await findActiveFoodByNameKey(values.nameKey, id.data)) {
      return nameTakenState();
    }

    let updated: { id: number }[];

    try {
      updated = await db
        .update(foods)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(foods.id, id.data), isNull(foods.archivedAt)))
        .returning({ id: foods.id });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return nameTakenState();
      }
      throw error;
    }

    // Archived or removed since the page was opened.
    if (!updated.length) {
      return createErrorState(FOOD_MESSAGES.NOT_FOUND);
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

    const archived = await db
      .update(foods)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(foods.id, id.data), isNull(foods.archivedAt)))
      .returning({ id: foods.id });

    if (!archived.length) {
      return { status: "error", message: FOOD_MESSAGES.NOT_FOUND };
    }
    revalidateFoods();
    return { status: "success" };
  },
);
