import type { Macro } from "@pt/contracts";

export type { Macro };

export type MacroAmounts = Record<Macro, number>;

export type TargetSource = "manual" | "tdee";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export type Sex = "male" | "female";

export type ActivityLevel =
  "sedentary" | "light" | "moderate" | "active" | "very_active";

export type Goal = "cut" | "maintain" | "bulk";

// Macros in grams plus the kcal counted for them. Free foods can carry kcal
// without macros, so kcal is not always 4/4/9 of the macros.
export interface EatenAmounts extends MacroAmounts {
  kcal: number;
}

export interface TargetRow extends MacroAmounts {
  effectiveFrom: string;
  note: string;
  source: TargetSource;
}

export interface EntryRow {
  id: number;
  date: string;
  meal: Meal;
  description: string;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
}

export interface NutritionDay {
  date: string;
  target: TargetRow | null;
  entries: EntryRow[];
  loggedCount: number;
  totals: MacroAmounts;
  totalKcal: number;
}

export type ComparedMetric = Macro | "kcal";

export type TargetStatus = "none" | "under" | "on" | "over";

export interface MacroComparison {
  status: TargetStatus;
  difference: number;
  percent: number;
}

export interface NutritionWeekSummary {
  loggedDays: number;
  averages: MacroAmounts;
  averageKcal: number;
  onTargetDays: number;
}

export interface BodyProfileValues {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  kcalAdjustment: number | null;
  proteinPerKg: number | null;
}

export interface EnergyPlan {
  age: number;
  bmr: number;
  tdee: number;
  targetCalories: number;
  isFlooredToBmr: boolean;
  macros: MacroAmounts;
}

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface WeeklyWeight {
  weekStart: string;
  averageKg: number | null;
  count: number;
}

// What a logged food adds up to, in kcal and grams of macros.
export interface LogNutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

// Per 100 g.
export type Per100 = Pick<LogNutrition, "protein" | "carbs" | "fat">;
