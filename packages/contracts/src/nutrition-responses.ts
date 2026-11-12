import { FOOD_GROUP_VALUES } from "./food-groups.js";
import { z } from "zod";

// Response bodies of the nutrition, meal plan and meal log endpoints.

const macroAmounts = z.object({
  carbs: z.number(),
  protein: z.number(),
  fat: z.number(),
});

export const targetSourceSchema = z.enum(["manual", "tdee"]);

export const nutritionTargetResponseSchema = z.object({
  effectiveFrom: z.string(),
  carbs: z.number().int(),
  protein: z.number().int(),
  fat: z.number().int(),
  note: z.string(),
  source: targetSourceSchema,
});
export type NutritionTargetResponse = z.infer<
  typeof nutritionTargetResponseSchema
>;

export const foodEntryResponseSchema = z.object({
  id: z.number().int(),
  date: z.string(),
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: z.string(),
  carbs: z.number().int().nullable(),
  protein: z.number().int().nullable(),
  fat: z.number().int().nullable(),
});
export type FoodEntryResponse = z.infer<typeof foodEntryResponseSchema>;

export const bodyProfileResponseSchema = z.object({
  sex: z.enum(["male", "female"]),
  birthYear: z.number().int(),
  heightCm: z.number(),
  weightKg: z.number(),
  activityLevel: z.enum([
    "sedentary",
    "light",
    "moderate",
    "active",
    "very_active",
  ]),
  // Legacy; the maths use it only while kcalAdjustment is null.
  goal: z.enum(["cut", "maintain", "bulk"]),
  kcalAdjustment: z.number().int().nullable(),
  proteinPerKg: z.number().nullable(),
});
export type BodyProfileResponse = z.infer<typeof bodyProfileResponseSchema>;

export const energyPlanResponseSchema = z.object({
  age: z.number().int(),
  bmr: z.number(),
  tdee: z.number(),
  targetCalories: z.number(),
  // TDEE + adjustment fell below the BMR and the target was raised to it.
  isFlooredToBmr: z.boolean(),
  macros: macroAmounts,
});
export type EnergyPlanResponse = z.infer<typeof energyPlanResponseSchema>;

// The stored measurements plus the energy plan worked out for today.
export const bodyProfileDetailResponseSchema = z.object({
  profile: bodyProfileResponseSchema,
  energyPlan: energyPlanResponseSchema,
});
export type BodyProfileDetailResponse = z.infer<
  typeof bodyProfileDetailResponseSchema
>;

export const saveBodyProfileResponseSchema = z.object({
  bodyProfile: bodyProfileDetailResponseSchema,
  // The target after the save (the TDEE one when it was applied).
  target: nutritionTargetResponseSchema.nullable(),
  targetApplied: z.boolean(),
});
export type SaveBodyProfileResponse = z.infer<
  typeof saveBodyProfileResponseSchema
>;

export const weightLogResponseSchema = z.object({
  date: z.string(),
  weightKg: z.number(),
});
export type WeightLogResponse = z.infer<typeof weightLogResponseSchema>;

export const saveWeightResponseSchema = z.object({
  weightLog: weightLogResponseSchema,
  targetApplied: z.boolean(),
});
export type SaveWeightResponse = z.infer<typeof saveWeightResponseSchema>;

export const weeklyWeightResponseSchema = z.object({
  weekStart: z.string(),
  // Average of that week's weigh-ins, or null when there were none.
  averageKg: z.number().nullable(),
  count: z.number().int(),
});

export const weightChangeResponseSchema = z.object({
  latest: z.number().nullable(),
  weekChange: z.number().nullable(),
  totalChange: z.number().nullable(),
});

export const nutritionDayResponseSchema = z.object({
  date: z.string(),
  target: nutritionTargetResponseSchema.nullable(),
  entries: z.array(foodEntryResponseSchema),
  loggedCount: z.number().int(),
  totals: macroAmounts,
  totalKcal: z.number(),
});
export type NutritionDayResponse = z.infer<typeof nutritionDayResponseSchema>;

export const nutritionWeekSummaryResponseSchema = z.object({
  loggedDays: z.number().int(),
  averages: macroAmounts,
  averageKcal: z.number(),
  onTargetDays: z.number().int(),
});

// GET /me/nutrition and GET /trainees/:userId/nutrition
export const nutritionOverviewResponseSchema = z.object({
  today: z.string(),
  weekStart: z.string(),
  latestTarget: nutritionTargetResponseSchema.nullable(),
  bodyProfile: bodyProfileDetailResponseSchema.nullable(),
  days: z.array(nutritionDayResponseSchema),
  summary: nutritionWeekSummaryResponseSchema,
  // The 12 weeks ending with this week, oldest first.
  weightWeeks: z.array(weeklyWeightResponseSchema),
  weightChange: weightChangeResponseSchema,
  todayWeight: z.number().nullable(),
});
export type NutritionOverviewResponse = z.infer<
  typeof nutritionOverviewResponseSchema
>;

const logNutrition = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const planFoodResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  nameKey: z.string(),
  nameEn: z.string().nullable(),
  nameZh: z.string().nullable(),
  group: z.enum(FOOD_GROUP_VALUES),
  state: z.enum(["raw", "cooked"]).nullable(),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  // Archived foods keep showing in the plans that use them.
  isArchived: z.boolean(),
});

export const planItemResponseSchema = z.object({
  id: z.number().int(),
  foodId: z.number().int(),
  grams: z.number(),
  food: planFoodResponseSchema,
});
export type PlanItemResponse = z.infer<typeof planItemResponseSchema>;

export const planMealResponseSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  name: z.string(),
  // Null = equal split of the day target.
  sharePercent: z.number().nullable(),
  items: z.array(planItemResponseSchema),
});

export const planDayResponseSchema = z.object({
  id: z.number().int(),
  date: z.string(),
  meals: z.array(planMealResponseSchema),
});
export type PlanDayResponse = z.infer<typeof planDayResponseSchema>;

export const dayCompletionSchema = z.enum(["complete", "partial", "none"]);

export const mealLogResponseSchema = z.object({
  id: z.number().int(),
  mealId: z.number().int(),
  // Null for a free food.
  foodId: z.number().int().nullable(),
  name: z.string(),
  nameEn: z.string().nullable(),
  nameZh: z.string().nullable(),
  isFree: z.boolean(),
  isArchived: z.boolean(),
  // A library log whose food row is gone: no numbers, cannot be edited.
  isMissingFood: z.boolean(),
  grams: z.number(),
  typed: z.object({
    kcal: z.number().nullable(),
    protein: z.number().nullable(),
    carbs: z.number().nullable(),
    fat: z.number().nullable(),
  }),
  nutrition: logNutrition.nullable(),
});
export type MealLogResponse = z.infer<typeof mealLogResponseSchema>;

export const mealMarkResponseSchema = z.object({
  mealId: z.number().int(),
  achieved: z.boolean(),
  note: z.string(),
  // Planned items as they were when "Đạt" was marked.
  frozen: z.array(
    z.object({ foodId: z.number().int(), nutrition: logNutrition }),
  ),
});
export type MealMarkResponse = z.infer<typeof mealMarkResponseSchema>;

export const setMealMarkResponseSchema = z.object({
  // Null when the mark was removed (not achieved, empty note).
  mark: mealMarkResponseSchema.nullable(),
});

const mealPreferencesResponse = z.object({
  preferredMealCount: z.number().int().nullable(),
  foodNote: z.string().nullable(),
});
export const mealPreferencesResponseSchema = mealPreferencesResponse;

const mealPlanWeekFields = {
  weekStart: z.string(),
  days: z.array(planDayResponseSchema),
  completion: z.record(z.string(), dayCompletionSchema),
  logs: z.array(mealLogResponseSchema),
  marks: z.array(mealMarkResponseSchema),
  preferences: mealPreferencesResponse,
};

// GET /me/meal-plan-days
export const mealPlanWeekResponseSchema = z.object(mealPlanWeekFields);
export type MealPlanWeekResponse = z.infer<typeof mealPlanWeekResponseSchema>;

// GET /trainees/:userId/meal-plan-days
export const traineeMealPlanWeekResponseSchema = z.object({
  ...mealPlanWeekFields,
  lastWeekPlanCount: z.number().int(),
  nextWeekPlanDates: z.array(z.string()),
  planKcalNotices: z.array(
    z.object({ date: z.string(), gapKcal: z.number().int() }),
  ),
  datesWithLogs: z.array(z.string()),
});
export type TraineeMealPlanWeekResponse = z.infer<
  typeof traineeMealPlanWeekResponseSchema
>;

export const copyPlanResultResponseSchema = z.object({
  copied: z.number().int(),
  skipped: z.number().int(),
});

export const copyInfoResponseSchema = z.object({
  planDates: z.array(z.string()),
  logDates: z.array(z.string()),
});
