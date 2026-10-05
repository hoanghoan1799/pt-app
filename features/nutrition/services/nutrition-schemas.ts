import { z } from "zod";

import { BODY_LIMITS } from "@/features/nutrition/constants/energy";
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

// Accepts "72,5" as well as "72.5" (Vietnamese decimal comma).
const decimalField = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Nhập ${label}`)
    .transform((value) => Number(value.replace(",", ".")))
    .pipe(
      z
        .number({ error: `${label} phải là số` })
        .min(min, `${label} từ ${min}`)
        .max(max, `${label} tối đa ${max}`),
    );

export const bodyProfileSchema = z.object({
  userId: z.coerce.number().int().positive(),
  sex: z.enum(["male", "female"], { error: "Chọn giới tính" }),
  age: decimalField("Tuổi", BODY_LIMITS.AGE.min, BODY_LIMITS.AGE.max).pipe(
    z.number().int("Tuổi là số nguyên"),
  ),
  heightCm: decimalField(
    "Chiều cao",
    BODY_LIMITS.HEIGHT_CM.min,
    BODY_LIMITS.HEIGHT_CM.max,
  ),
  weightKg: decimalField(
    "Cân nặng",
    BODY_LIMITS.WEIGHT_KG.min,
    BODY_LIMITS.WEIGHT_KG.max,
  ),
  activityLevel: z.enum(
    ["sedentary", "light", "moderate", "active", "very_active"],
    {
      error: "Chọn mức vận động",
    },
  ),
  goal: z.enum(["cut", "maintain", "bulk"], { error: "Chọn mục tiêu" }),
  // Checkbox: present ("on") when ticked.
  applyToTarget: z
    .string()
    .optional()
    .transform((value) => value === "on"),
});

// What a user may send about themselves: no userId (taken from the session)
// and no choice about the target (decided by its source).
export const myBodyProfileSchema = bodyProfileSchema.omit({
  userId: true,
  applyToTarget: true,
});

export const weightLogSchema = z.object({
  weightKg: decimalField(
    "Cân nặng",
    BODY_LIMITS.WEIGHT_KG.min,
    BODY_LIMITS.WEIGHT_KG.max,
  ),
});
