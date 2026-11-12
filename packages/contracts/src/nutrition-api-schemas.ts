import { addDays, isValidDate } from "./date.js";
import {
  addMealLogSchema,
  setMealMarkSchema,
  updateMealLogSchema,
} from "./meal-log-schemas.js";
import {
  addItemSchema,
  applyLastWeekSchema,
  autoSolveSchema,
  copyMealPlanDaySchema,
  createDayPlanSchema,
  renameMealSchema,
  reorderMealsSchema,
  setMealSharesSchema,
  updateItemGramsSchema,
} from "./meal-plan-schemas.js";
import {
  bodyProfileSchema,
  foodEntrySchema,
  myBodyProfileSchema,
  targetSchema,
  weightLogSchema,
} from "./nutrition-schemas.js";
import { z } from "zod";

// REST request bodies. The ids that the URL carries (trainee, day, meal, item,
// log) are not repeated in the body, so each schema is the existing form or
// action schema with that id left out. Nutrition bodies keep the form field
// formats (text such as "72,5"), so the rules and messages stay the same.

export const idParamSchema = z.coerce.number().int().positive();

export const dateParamSchema = z
  .string()
  .refine((value) => isValidDate(value), "Ngày không hợp lệ");

// ?week=YYYY-MM-DD: any date of the week; omitted = the current week.
export const weekQuerySchema = z.object({
  week: dateParamSchema.optional(),
});
export type WeekQuery = z.infer<typeof weekQuerySchema>;

export const targetBodySchema = targetSchema.omit({ userId: true });
export type TargetBody = z.infer<typeof targetBodySchema>;

// `applyToTarget` is the form checkbox ("on"); JSON clients may send a boolean.
export const bodyProfileBodySchema = bodyProfileSchema
  .omit({ userId: true })
  .extend({
    applyToTarget: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((value) => value === true || value === "on"),
  });
export type BodyProfileBody = z.infer<typeof bodyProfileBodySchema>;

export const foodEntryBodySchema = foodEntrySchema.omit({ entryId: true });
export type FoodEntryBody = z.infer<typeof foodEntryBodySchema>;

export const createDayPlanBodySchema = createDayPlanSchema.omit({
  userId: true,
});
export const renameMealBodySchema = renameMealSchema.omit({
  userId: true,
  mealId: true,
});
export const reorderMealsBodySchema = reorderMealsSchema.omit({
  userId: true,
  dayId: true,
});
export const setMealSharesBodySchema = setMealSharesSchema.omit({
  userId: true,
  dayId: true,
});
export const addItemBodySchema = addItemSchema.omit({
  userId: true,
  mealId: true,
});
export const updateItemGramsBodySchema = updateItemGramsSchema.omit({
  userId: true,
  itemId: true,
});
export const autoSolveBodySchema = autoSolveSchema.omit({
  userId: true,
  mealId: true,
});
export const copyMealPlanDayBodySchema = copyMealPlanDaySchema.omit({
  userId: true,
});
export const applyLastWeekBodySchema = applyLastWeekSchema.omit({
  userId: true,
});

// A month grid shows at most 6 weeks (same rule as copyMealPlanMonthInfoSchema).
export const copyInfoQuerySchema = z
  .object({ from: dateParamSchema, to: dateParamSchema })
  .refine(
    ({ from, to }) =>
      isValidDate(from) && isValidDate(to) && from <= to && to <= addDays(from, 42),
  );

export const addMealLogBodySchema = z.discriminatedUnion("kind", [
  addMealLogSchema.options[0].omit({ mealId: true }),
  addMealLogSchema.options[1].omit({ mealId: true }),
]);
export const updateMealLogBodySchema = updateMealLogSchema.omit({
  logId: true,
});
export const setMealMarkBodySchema = setMealMarkSchema.omit({ mealId: true });

export type CreateDayPlanBody = z.infer<typeof createDayPlanBodySchema>;
export type RenameMealBody = z.infer<typeof renameMealBodySchema>;
export type ReorderMealsBody = z.infer<typeof reorderMealsBodySchema>;
export type SetMealSharesBody = z.infer<typeof setMealSharesBodySchema>;
export type AddItemBody = z.infer<typeof addItemBodySchema>;
export type UpdateItemGramsBody = z.infer<typeof updateItemGramsBodySchema>;
export type AutoSolveBody = z.infer<typeof autoSolveBodySchema>;
export type CopyMealPlanDayBody = z.infer<typeof copyMealPlanDayBodySchema>;
export type ApplyLastWeekBody = z.infer<typeof applyLastWeekBodySchema>;
export type CopyInfoQuery = z.infer<typeof copyInfoQuerySchema>;
export type AddMealLogBody = z.infer<typeof addMealLogBodySchema>;
export type UpdateMealLogBody = z.infer<typeof updateMealLogBodySchema>;
export type SetMealMarkBody = z.infer<typeof setMealMarkBodySchema>;

export type MyBodyProfileBody = z.infer<typeof myBodyProfileSchema>;
export type WeightLogBody = z.infer<typeof weightLogSchema>;
