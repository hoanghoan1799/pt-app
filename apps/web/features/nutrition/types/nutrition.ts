import type { Macro } from "@pt/contracts";

export type { Macro };

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export type MacroAmounts = Record<Macro, number>;

export type TargetSource = "manual" | "tdee";

// Macros in grams plus the kcal that were counted for them. Free foods can
// carry kcal without macros, so kcal is not always 4/4/9 of the macros.
export interface EatenAmounts extends MacroAmounts {
  kcal: number;
}

export interface NutritionTarget extends MacroAmounts {
  effectiveFrom: string;
  note: string;
  source: TargetSource;
}

export interface FoodEntry {
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
  target: NutritionTarget | null;
  entries: FoodEntry[];
  // Old free-text entries plus the foods logged in the meal plan; the day
  // counts as logged when this is above 0.
  loggedCount: number;
  // Macros of the entries and the meal logs together, whole grams.
  totals: MacroAmounts;
  // Counted kcal of the day, whole kcal: the entries' 4/4/9 plus the kcal of
  // the meal logs and marked meals (a free food may have kcal only).
  totalKcal: number;
}

// What compareToTarget judges: a macro in grams or the day's calories.
export type ComparedMetric = Macro | "kcal";

export type TargetStatus = "none" | "under" | "on" | "over";

export interface MacroComparison {
  status: TargetStatus;
  // Grams still to eat (under) or eaten beyond the target (over).
  difference: number;
  percent: number;
}

export interface NutritionWeekSummary {
  loggedDays: number;
  // Average per logged day, rounded.
  averages: MacroAmounts;
  // Average counted kcal per logged day, rounded.
  averageKcal: number;
  // Days where every macro with a target ended "on" target.
  onTargetDays: number;
}

export type Sex = "male" | "female";

export type ActivityLevel =
  "sedentary" | "light" | "moderate" | "active" | "very_active";

export type Goal = "cut" | "maintain" | "bulk";

export interface BodyProfile {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  // Legacy; the maths use it only while kcalAdjustment is null.
  goal: Goal;
  // Daily kcal on top of the TDEE; null = legacy goal factor.
  kcalAdjustment: number | null;
  // Protein g per kg of body weight; null = legacy goal value.
  proteinPerKg: number | null;
}

export interface EnergyPlan {
  age: number;
  bmr: number;
  tdee: number;
  targetCalories: number;
  // True when TDEE + adjustment fell below the BMR and the target was raised to it.
  isFlooredToBmr: boolean;
  macros: MacroAmounts;
}

export type BodyProfileEditor = "admin" | "user";

export interface WeightLog {
  date: string;
  weightKg: number;
}

export interface WeeklyWeight {
  weekStart: string;
  // Average of that week's weigh-ins, or null when there were none.
  averageKg: number | null;
  count: number;
}

export interface ChartPoint {
  index: number;
  x: number;
  y: number;
  value: number;
}
