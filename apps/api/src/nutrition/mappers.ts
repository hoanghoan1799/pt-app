import type {
  BodyProfileDetailResponse,
  FoodEntryResponse,
  NutritionDayResponse,
  NutritionTargetResponse,
} from "@pt/contracts";
import type { planFoodResponseSchema } from "@pt/contracts";
import type { z } from "zod";

import type { FoodFacts } from "./foods-reader.js";
import { calculateEnergyPlan } from "./rules/energy.js";
import type {
  BodyProfileValues,
  EntryRow,
  NutritionDay,
  TargetRow,
} from "./rules/types.js";

// Rows and rule results -> response. Explicit field lists: a new column never
// reaches a client by accident.

export const toTargetResponse = (row: TargetRow): NutritionTargetResponse => ({
  effectiveFrom: row.effectiveFrom,
  carbs: row.carbs,
  protein: row.protein,
  fat: row.fat,
  note: row.note,
  source: row.source,
});

export const toEntryResponse = (row: EntryRow): FoodEntryResponse => ({
  id: row.id,
  date: row.date,
  meal: row.meal,
  description: row.description,
  carbs: row.carbs,
  protein: row.protein,
  fat: row.fat,
});

export const toDayResponse = (day: NutritionDay): NutritionDayResponse => ({
  date: day.date,
  target: day.target ? toTargetResponse(day.target) : null,
  entries: day.entries.map(toEntryResponse),
  loggedCount: day.loggedCount,
  totals: day.totals,
  totalKcal: day.totalKcal,
});

// The stored measurements plus the energy plan worked out for `today`.
export const toBodyProfileDetail = (
  profile: BodyProfileValues,
  today: string,
): BodyProfileDetailResponse => ({
  profile: {
    sex: profile.sex,
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    kcalAdjustment: profile.kcalAdjustment,
    proteinPerKg: profile.proteinPerKg,
  },
  energyPlan: calculateEnergyPlan(profile, today),
});

export const toPlanFoodResponse = (
  food: FoodFacts,
): z.infer<typeof planFoodResponseSchema> => ({
  id: food.id,
  name: food.name,
  nameKey: food.nameKey,
  nameEn: food.nameEn,
  nameZh: food.nameZh,
  group: food.group,
  state: food.state,
  kcal: food.kcal,
  protein: food.protein,
  carbs: food.carbs,
  fat: food.fat,
  isArchived: food.archivedAt !== null,
});
