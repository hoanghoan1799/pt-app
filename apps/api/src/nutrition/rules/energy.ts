import { KCAL_PER_GRAM } from "@pt/contracts";

import type {
  ActivityLevel,
  BodyProfileValues,
  EnergyPlan,
  Goal,
  Sex,
} from "./types.js";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Legacy fallback only: calories relative to TDEE and protein per kg of body
// weight, per goal. Used while kcal_adjustment / protein_per_kg are still null.
export const GOALS: Record<
  Goal,
  { calorieFactor: number; proteinPerKg: number }
> = {
  cut: { calorieFactor: 0.8, proteinPerKg: 2.2 },
  maintain: { calorieFactor: 1, proteinPerKg: 1.8 },
  bulk: { calorieFactor: 1.1, proteinPerKg: 2 },
};

// Mifflin-St Jeor: 10*kg + 6.25*cm - 5*age + s, s = +5 (male) / -161 (female).
export const BMR_SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161 };

// Share of target calories that comes from fat; carbs fill the rest.
export const FAT_CALORIE_SHARE = 0.25;
export const MACRO_ROUNDING_GRAMS = 5;
export const CALORIE_ROUNDING = 10;

const roundTo = (value: number, step: number) =>
  Math.round(value / step) * step;

export const getAge = (birthYear: number, today: string) =>
  Number(today.slice(0, 4)) - birthYear;

export const getBirthYear = (age: number, today: string) =>
  Number(today.slice(0, 4)) - age;

export const calculateBmr = (
  { sex, weightKg, heightCm }: BodyProfileValues,
  age: number,
) => 10 * weightKg + 6.25 * heightCm - 5 * age + BMR_SEX_OFFSET[sex];

// The goal follows the sign of the PT's kcal adjustment.
export const getGoalFromAdjustment = (kcalAdjustment: number): Goal => {
  if (kcalAdjustment < 0) {
    return "cut";
  }
  return kcalAdjustment > 0 ? "bulk" : "maintain";
};

export const getGoal = ({
  kcalAdjustment,
  goal,
}: Pick<BodyProfileValues, "kcalAdjustment" | "goal">): Goal =>
  kcalAdjustment === null ? goal : getGoalFromAdjustment(kcalAdjustment);

// BMR (Mifflin-St Jeor) x activity = TDEE; the target is TDEE + the PT's kcal
// adjustment (never below the BMR); protein per kg, fat a share of calories,
// carbs fill the rest. A null adjustment / protein_per_kg falls back to the
// legacy goal values.
export const calculateEnergyPlan = (
  profile: BodyProfileValues,
  today: string,
): EnergyPlan => {
  const age = getAge(profile.birthYear, today);
  const bmr = calculateBmr(profile, age);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const legacy = GOALS[profile.goal];
  const wantedCalories =
    profile.kcalAdjustment === null
      ? tdee * legacy.calorieFactor
      : tdee + profile.kcalAdjustment;
  const isFlooredToBmr =
    profile.kcalAdjustment !== null && wantedCalories < bmr;
  const targetCalories = isFlooredToBmr ? bmr : wantedCalories;
  const protein = roundTo(
    profile.weightKg * (profile.proteinPerKg ?? legacy.proteinPerKg),
    MACRO_ROUNDING_GRAMS,
  );
  const fat = Math.max(
    0,
    roundTo(
      (targetCalories * FAT_CALORIE_SHARE) / KCAL_PER_GRAM.fat,
      MACRO_ROUNDING_GRAMS,
    ),
  );
  const remainingCalories =
    targetCalories - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat;
  const carbs = Math.max(
    0,
    roundTo(remainingCalories / KCAL_PER_GRAM.carbs, MACRO_ROUNDING_GRAMS),
  );

  return {
    age,
    bmr: roundTo(bmr, CALORIE_ROUNDING),
    tdee: roundTo(tdee, CALORIE_ROUNDING),
    targetCalories: roundTo(targetCalories, CALORIE_ROUNDING),
    isFlooredToBmr,
    macros: { carbs, protein, fat },
  };
};
