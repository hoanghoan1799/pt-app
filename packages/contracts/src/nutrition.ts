export type Macro = "carbs" | "protein" | "fat";

export const PROTEIN_PER_KG_LIMITS = { min: 1, max: 3 } as const;

// Daily kcal added to (positive) or taken from (negative) the TDEE.
export const KCAL_ADJUSTMENT_LIMITS = { min: -1500, max: 1500 } as const;

export const KCAL_PER_GRAM: Record<Macro, number> = {
  carbs: 4,
  protein: 4,
  fat: 9,
};

export const BODY_LIMITS = {
  AGE: { min: 12, max: 90 },
  HEIGHT_CM: { min: 120, max: 230 },
  WEIGHT_KG: { min: 30, max: 250 },
} as const;

export const NUTRITION_LIMITS = {
  MAX_GRAMS: 2000,
  DESCRIPTION: 300,
  NOTE: 1000,
} as const;
