import type {
  ActivityLevel,
  Goal,
  Macro,
  Sex,
} from "@/features/nutrition/types/nutrition";

// Display labels are keys under the nutrition.labels namespace (translated at render).
export const SEX_LABEL_KEYS = {
  male: "sex.male",
  female: "sex.female",
} as const satisfies Record<Sex, string>;

export const ACTIVITY_LEVELS = {
  sedentary: {
    factor: 1.2,
    labelKey: "activity.sedentary.label",
    descriptionKey: "activity.sedentary.description",
  },
  light: {
    factor: 1.375,
    labelKey: "activity.light.label",
    descriptionKey: "activity.light.description",
  },
  moderate: {
    factor: 1.55,
    labelKey: "activity.moderate.label",
    descriptionKey: "activity.moderate.description",
  },
  active: {
    factor: 1.725,
    labelKey: "activity.active.label",
    descriptionKey: "activity.active.description",
  },
  very_active: {
    factor: 1.9,
    labelKey: "activity.veryActive.label",
    descriptionKey: "activity.veryActive.description",
  },
} as const satisfies Record<
  ActivityLevel,
  { factor: number; labelKey: string; descriptionKey: string }
>;

export const ACTIVITY_LEVEL_ORDER: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

// Legacy fallback only: calories relative to TDEE and protein per kg of body
// weight, per goal. Used while a member's kcal_adjustment / protein_per_kg are
// still null; once the PT saves the profile those two fields take over.
export const GOALS = {
  cut: { labelKey: "goal.cut", calorieFactor: 0.8, proteinPerKg: 2.2 },
  maintain: { labelKey: "goal.maintain", calorieFactor: 1, proteinPerKg: 1.8 },
  bulk: { labelKey: "goal.bulk", calorieFactor: 1.1, proteinPerKg: 2 },
} as const satisfies Record<
  Goal,
  { labelKey: string; calorieFactor: number; proteinPerKg: number }
>;

export const GOAL_ORDER: Goal[] = ["cut", "maintain", "bulk"];

// Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + s, s = +5 (male) / −161 (female).
export const BMR_SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161 };

// Protein g per kg of body weight when the PT sets none: by sex.
export const PROTEIN_PER_KG_DEFAULT: Record<Sex, number> = {
  male: 2,
  female: 1.6,
};

export const PROTEIN_PER_KG_LIMITS = { min: 1, max: 3 } as const;

// Daily kcal added to (positive) or taken from (negative) the TDEE.
export const KCAL_ADJUSTMENT_LIMITS = { min: -1500, max: 1500 } as const;

// One rule for "on target", in grams except kcalDiff (kcal): kcal within
// ±kcalDiff of the target's kcal, protein no more than proteinUnder below
// target (above is fine), carbs and fat within ±carbsFat.
export const ON_TARGET = {
  kcalDiff: 80,
  proteinUnder: 5,
  carbsFat: 10,
} as const;

export const KCAL_PER_GRAM: Record<Macro, number> = {
  carbs: 4,
  protein: 4,
  fat: 9,
};

// Share of target calories that comes from fat; carbs fill the rest.
export const FAT_CALORIE_SHARE = 0.25;

export const MACRO_ROUNDING_GRAMS = 5;
export const CALORIE_ROUNDING = 10;

export const BODY_LIMITS = {
  AGE: { min: 12, max: 90 },
  HEIGHT_CM: { min: 120, max: 230 },
  WEIGHT_KG: { min: 30, max: 250 },
} as const;
