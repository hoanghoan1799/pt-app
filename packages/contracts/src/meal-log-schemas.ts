import {
  MEAL_LOG_LIMITS,
  MEAL_LOG_MESSAGES,
  MEAL_PLAN_LIMITS,
} from "./meal-plans.js";
import { normalizeName } from "./name.js";
import { z } from "zod";

const id = z.number().int().positive();

const round1 = (value: number) => Math.round(value * 10) / 10;

// A library food needs an amount; a free food may leave it at 0.
const grams = z
  .number()
  .finite()
  .min(0)
  .max(MEAL_PLAN_LIMITS.MAX_GRAMS)
  .transform(round1);

// Optional typed number: missing or null means "not given".
const typed = (max: number) =>
  z
    .number()
    .finite()
    .min(0)
    .max(max)
    .transform(round1)
    .nullish()
    .transform((value) => value ?? null);

const customName = z
  .string()
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(1, MEAL_LOG_MESSAGES.NAME_REQUIRED)
      .max(MEAL_LOG_LIMITS.CUSTOM_NAME),
  );

const freeFields = {
  customName,
  grams,
  kcal: typed(MEAL_LOG_LIMITS.MAX_KCAL),
  protein: typed(MEAL_LOG_LIMITS.MAX_MACRO_GRAMS),
  carbs: typed(MEAL_LOG_LIMITS.MAX_MACRO_GRAMS),
  fat: typed(MEAL_LOG_LIMITS.MAX_MACRO_GRAMS),
};

export const addMealLogSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("library"),
    mealId: id,
    foodId: id,
    grams: grams.refine((value) => value > 0, MEAL_LOG_MESSAGES.GRAMS_REQUIRED),
  }),
  z.object({ kind: z.literal("free"), mealId: id, ...freeFields }),
]);

// Editing keeps the kind of the row: a library food changes its grams, a free
// food its name, grams and numbers.
export const updateMealLogSchema = z.object({
  logId: id,
  grams,
  customName: customName.optional(),
  kcal: freeFields.kcal,
  protein: freeFields.protein,
  carbs: freeFields.carbs,
  fat: freeFields.fat,
});

export const removeMealLogSchema = z.object({ logId: id });

export const setMealMarkSchema = z.object({
  mealId: id,
  achieved: z.boolean(),
  note: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(MEAL_LOG_LIMITS.MARK_NOTE)),
});
