import {
  ACTIVITY_LEVELS,
  BMR_SEX_OFFSET,
  BODY_LIMITS,
  CALORIE_ROUNDING,
  FAT_CALORIE_SHARE,
  FOOD_EQUIVALENTS,
  GOALS,
  KCAL_PER_GRAM,
  MACRO_ROUNDING_GRAMS,
} from "@/features/nutrition/constants/energy";
import type {
  BodyProfile,
  EnergyPlan,
  Macro,
  MacroAmounts,
} from "@/features/nutrition/types/nutrition";
import { formatLang } from "@/features/nutrition/utils/nutrition";

const roundTo = (value: number, step: number) =>
  Math.round(value / step) * step;

export const getAge = (birthYear: number, today: string) =>
  Number(today.slice(0, 4)) - birthYear;

export const getBirthYear = (age: number, today: string) =>
  Number(today.slice(0, 4)) - age;

export const calculateBmr = (
  { sex, weightKg, heightCm }: BodyProfile,
  age: number,
) => 10 * weightKg + 6.25 * heightCm - 5 * age + BMR_SEX_OFFSET[sex];

export const calculateCalories = ({ carbs, protein, fat }: MacroAmounts) =>
  carbs * KCAL_PER_GRAM.carbs +
  protein * KCAL_PER_GRAM.protein +
  fat * KCAL_PER_GRAM.fat;

// BMR (Mifflin-St Jeor) × activity = TDEE; the goal adjusts calories; protein
// is set per kg of body weight, fat to a share of calories, carbs fill the rest.
export const calculateEnergyPlan = (
  profile: BodyProfile,
  today: string,
): EnergyPlan => {
  const age = getAge(profile.birthYear, today);
  const bmr = calculateBmr(profile, age);
  const tdee = bmr * ACTIVITY_LEVELS[profile.activityLevel].factor;
  const goal = GOALS[profile.goal];
  const targetCalories = tdee * goal.calorieFactor;
  const protein = roundTo(
    profile.weightKg * goal.proteinPerKg,
    MACRO_ROUNDING_GRAMS,
  );
  const fat = roundTo(
    (targetCalories * FAT_CALORIE_SHARE) / KCAL_PER_GRAM.fat,
    MACRO_ROUNDING_GRAMS,
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
    macros: { carbs, protein, fat },
  };
};

// The macro target pictured as food, weighed in lạng (100 g):
// 280 g carbs → "≈ 10 lạng cơm chín"; 56 g fat → "≈ 4 thìa dầu ăn".
export const describeFoodEquivalent = (macro: Macro, grams: number) => {
  const { food, gramsPerUnit, unit } = FOOD_EQUIVALENTS[macro];
  const amount = grams / gramsPerUnit;

  return unit === "g"
    ? `≈ ${formatLang(amount)} ${food}`
    : `≈ ${Math.round(amount)} ${unit} ${food}`;
};

export const formatCalories = (calories: number) =>
  `${Math.round(calories).toLocaleString("vi-VN")} kcal`;

export interface BodyProfileDraft {
  sex: BodyProfile["sex"];
  age: string;
  heightCm: string;
  weightKg: string;
  activityLevel: BodyProfile["activityLevel"];
  goal: BodyProfile["goal"];
}

const parseDecimal = (value: string) => Number(value.trim().replace(",", "."));

// Live preview while the admin types; null until every number is plausible.
export const toBodyProfile = (
  draft: BodyProfileDraft,
  today: string,
): BodyProfile | null => {
  const age = parseDecimal(draft.age);
  const heightCm = parseDecimal(draft.heightCm);
  const weightKg = parseDecimal(draft.weightKg);
  const isValid =
    Number.isInteger(age) &&
    age >= BODY_LIMITS.AGE.min &&
    age <= BODY_LIMITS.AGE.max &&
    heightCm >= BODY_LIMITS.HEIGHT_CM.min &&
    heightCm <= BODY_LIMITS.HEIGHT_CM.max &&
    weightKg >= BODY_LIMITS.WEIGHT_KG.min &&
    weightKg <= BODY_LIMITS.WEIGHT_KG.max;

  if (!isValid) {
    return null;
  }
  return {
    sex: draft.sex,
    birthYear: getBirthYear(age, today),
    heightCm,
    weightKg,
    activityLevel: draft.activityLevel,
    goal: draft.goal,
  };
};
