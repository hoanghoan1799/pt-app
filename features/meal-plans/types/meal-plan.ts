import type { Food } from "@/features/foods/types/food";
import type { MacroAmounts } from "@/features/nutrition/types/nutrition";

// A food as the plan needs it: per 100 g, plus whether the PT archived it
// since (archived foods keep showing in the plans that use them).
export type PlanFood = Pick<
  Food,
  | "id"
  | "name"
  | "nameKey"
  | "group"
  | "state"
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
> & {
  isArchived: boolean;
  // Vietnamese key plus the localized name, for the search (see localizeFood).
  searchKey?: string;
};

export interface PlanItem {
  id: number;
  foodId: number;
  grams: number;
  food: PlanFood;
}

export interface PlanMeal {
  id: number;
  position: number;
  name: string;
  // Null = equal split of the day target.
  sharePercent: number | null;
  items: PlanItem[];
}

export interface PlanDay {
  id: number;
  date: string;
  meals: PlanMeal[];
}

// What a meal should reach: grams of each macro, and the kcal they make.
export interface MealTarget extends MacroAmounts {
  kcal: number;
}

// Positive = still short of the target, negative = over it (grams).
export type MacroGap = MacroAmounts;

export interface MealGapNotice {
  macro: keyof MacroAmounts;
  kind: "short" | "over";
  grams: number;
}
