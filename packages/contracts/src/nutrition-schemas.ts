import { isValidDate } from "./date.js";
import { isOneDecimal, parseDecimal, parseSignedDecimal } from "./decimal.js";
import {
  BODY_LIMITS,
  KCAL_ADJUSTMENT_LIMITS,
  NUTRITION_LIMITS,
  PROTEIN_PER_KG_LIMITS,
} from "./nutrition.js";
import { z } from "zod";

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
    .transform(parseDecimal)
    .pipe(
      z
        .number({ error: `${label} phải là số` })
        .min(min, `${label} từ ${min}`)
        .max(max, `${label} tối đa ${max}`),
    );

const measurementsSchema = z.object({
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
});

// Admin: also sets the energy model (kcal on top of the TDEE, protein per kg).
// The goal is derived from the kcal sign, so it is not sent.
export const bodyProfileSchema = measurementsSchema.extend({
  userId: z.coerce.number().int().positive(),
  kcalAdjustment: z
    .string()
    .trim()
    .min(1, "Nhập số kcal")
    .transform(parseSignedDecimal)
    .pipe(
      z
        .number({ error: "Số kcal phải là số" })
        .int("Số kcal là số nguyên")
        .min(
          KCAL_ADJUSTMENT_LIMITS.min,
          `Số kcal từ ${KCAL_ADJUSTMENT_LIMITS.min}`,
        )
        .max(
          KCAL_ADJUSTMENT_LIMITS.max,
          `Số kcal tối đa ${KCAL_ADJUSTMENT_LIMITS.max}`,
        ),
    ),
  proteinPerKg: decimalField(
    "Đạm",
    PROTEIN_PER_KG_LIMITS.min,
    PROTEIN_PER_KG_LIMITS.max,
  ).refine(isOneDecimal, "Đạm chỉ nhận 1 chữ số thập phân (ví dụ 1,6)"),
  // Checkbox: present ("on") when ticked.
  applyToTarget: z
    .string()
    .optional()
    .transform((value) => value === "on"),
});

// What a user may send about themselves: no userId (taken from the session),
// no choice about the target (decided by its source) and no energy model (PT
// only; the stored values stay). The legacy goal is only used while the PT has
// not set the energy model.
export const myBodyProfileSchema = measurementsSchema.extend({
  goal: z.enum(["cut", "maintain", "bulk"], { error: "Chọn mục tiêu" }),
});

export const weightLogSchema = z.object({
  weightKg: decimalField(
    "Cân nặng",
    BODY_LIMITS.WEIGHT_KG.min,
    BODY_LIMITS.WEIGHT_KG.max,
  ),
});
