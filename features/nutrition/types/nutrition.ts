export type Macro = "carbs" | "protein" | "fat";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export type MacroAmounts = Record<Macro, number>;

export interface NutritionTarget extends MacroAmounts {
  effectiveFrom: string;
  note: string;
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
  totals: MacroAmounts;
}

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
  goal: Goal;
}

export interface EnergyPlan {
  age: number;
  bmr: number;
  tdee: number;
  targetCalories: number;
  macros: MacroAmounts;
}
