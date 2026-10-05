import { z } from "zod";

import { NUTRITION_LIMITS } from "@/features/nutrition/constants/nutrition";
import { isValidDate } from "@/utils/week";

const gramsField = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? Number(value) : null))
  .pipe(
    z
      .number({ error: "Nhập số gram" })
      .int("Nhập số gram nguyên")
      .min(0, "Không được âm")
      .max(NUTRITION_LIMITS.MAX_GRAMS, `Tối đa ${NUTRITION_LIMITS.MAX_GRAMS} g`)
      .nullable(),
  );

const requiredGrams = gramsField.pipe(
  z
    .number({ error: "Nhập số gram" })
    .int()
    .min(0)
    .max(NUTRITION_LIMITS.MAX_GRAMS),
);

export const targetSchema = z.object({
  userId: z.coerce.number().int().positive(),
  carbs: requiredGrams,
  protein: requiredGrams,
  fat: requiredGrams,
  note: z
    .string()
    .trim()
    .max(NUTRITION_LIMITS.NOTE, `Tối đa ${NUTRITION_LIMITS.NOTE} ký tự`)
    .optional()
    .transform((value) => value ?? ""),
});

export const foodEntrySchema = z.object({
  entryId: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().int().positive().nullable()),
  date: z.string().refine(isValidDate, "Ngày không hợp lệ"),
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"], {
    error: "Chọn bữa ăn",
  }),
  description: z
    .string()
    .trim()
    .max(
      NUTRITION_LIMITS.DESCRIPTION,
      `Tối đa ${NUTRITION_LIMITS.DESCRIPTION} ký tự`,
    )
    .optional()
    .transform((value) => value ?? ""),
  carbs: gramsField,
  protein: gramsField,
  fat: gramsField,
});
