import { addDays, isValidDate } from "./date.js";
import {
  MEAL_COUNT_LIMITS,
  MEAL_PLAN_LIMITS,
  MEAL_PLAN_MESSAGES,
} from "./meal-plans.js";
import { normalizeName } from "./name.js";
import { z } from "zod";

const id = z.number().int().positive();

const date = z.string().refine((value) => isValidDate(value));

const grams = z
  .number()
  .finite()
  .min(0)
  .max(MEAL_PLAN_LIMITS.MAX_GRAMS)
  // One decimal is plenty for a weighed food.
  .transform((value) => Math.round(value * 10) / 10)
  // A planned food needs an amount; 0 g shows the trainee a blank (KAN-92).
  .refine((value) => value > 0);

const MAX_COPY_DATES = 14;

export const createDayPlanSchema = z.object({ userId: id, date });

export const deleteDayPlanSchema = z.object({ userId: id, dayId: id });

export const addMealSchema = z.object({ userId: id, dayId: id });

export const removeMealSchema = z.object({ userId: id, mealId: id });

export const renameMealSchema = z.object({
  userId: id,
  mealId: id,
  name: z
    .string()
    .transform(normalizeName)
    .pipe(z.string().min(1).max(MEAL_PLAN_LIMITS.MEAL_NAME)),
});

export const reorderMealsSchema = z.object({
  userId: id,
  dayId: id,
  mealIds: z.array(id).min(1).max(MEAL_PLAN_LIMITS.MAX_MEALS_PER_DAY),
});

export const setMealSharesSchema = z.object({
  userId: id,
  dayId: id,
  // Null = back to an equal split.
  shares: z
    .array(
      z.object({
        mealId: id,
        percent: z.number().finite().gt(0).max(100),
      }),
    )
    .min(1)
    .max(MEAL_PLAN_LIMITS.MAX_MEALS_PER_DAY)
    .nullable(),
});

export const addItemSchema = z.object({
  userId: id,
  mealId: id,
  foodId: id,
  grams: grams.optional(),
});

export const removeItemSchema = z.object({ userId: id, itemId: id });

export const updateItemGramsSchema = z.object({
  userId: id,
  itemId: id,
  grams,
});

export const autoSolveSchema = z.object({
  userId: id,
  mealId: id,
  // Items that keep their grams (e.g. 300 g of vegetables).
  fixedItemIds: z.array(id).max(MEAL_PLAN_LIMITS.MAX_ITEMS_PER_MEAL),
});

export const copyMealPlanDaySchema = z.object({
  userId: id,
  dayId: id,
  dates: z
    .array(date)
    .min(1, MEAL_PLAN_MESSAGES.NO_TARGET_DAYS)
    .max(MAX_COPY_DATES),
});

// A month grid shows at most 6 weeks.
const MAX_MONTH_SPAN_DAYS = 42;

export const copyMealPlanMonthInfoSchema = z
  .object({ userId: id, from: date, to: date })
  .refine(
    ({ from, to }) => from <= to && to <= addDays(from, MAX_MONTH_SPAN_DAYS),
  );

export const applyLastWeekSchema = z.object({ userId: id, weekStart: date });

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => normalizeName(value ?? ""))
    .pipe(z.string().max(max, `Tối đa ${max} ký tự`))
    .transform((value) => value || null);

// The trainee's request (Q1): both optional.
export const mealPreferencesSchema = z.object({
  mealCount: z
    .string()
    .trim()
    .optional()
    .transform((value, context) => {
      if (!value) {
        return null;
      }

      const count = Number(value);

      if (
        !Number.isInteger(count) ||
        count < MEAL_COUNT_LIMITS.min ||
        count > MEAL_COUNT_LIMITS.max
      ) {
        context.addIssue({
          code: "custom",
          message: `Chọn từ ${MEAL_COUNT_LIMITS.min} đến ${MEAL_COUNT_LIMITS.max} bữa`,
        });
        return z.NEVER;
      }
      return count;
    }),
  foodNote: optionalText(MEAL_PLAN_LIMITS.FOOD_NOTE),
});
