import { FOOD_LIMITS } from "@/features/foods/constants/foods";
import type { Food, FoodAmount, MacroShare } from "@/features/foods/types/food";
import { KCAL_PER_GRAM } from "@/features/nutrition/constants/energy";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale, toIntlLocale } from "@/utils/locale";

type Macros = Pick<Food, "protein" | "carbs" | "fat">;

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
};

// An empty, negative or non-numeric amount counts as nothing eaten.
const toSafeGrams = (grams: number) =>
  Number.isFinite(grams) && grams > 0 ? grams : 0;

// Calories implied by the macros, with the same 4/4/9 factors the targets use.
export const kcalFromMacros = ({ protein, carbs, fat }: Macros) =>
  protein * KCAL_PER_GRAM.protein +
  carbs * KCAL_PER_GRAM.carbs +
  fat * KCAL_PER_GRAM.fat;

// How far the entered kcal is from the macros' kcal, as a share of the entered
// kcal (0.052 = 5.2 %). Zero kcal against non-zero macros counts as 100 %.
export const kcalGap = (kcal: number, macros: Macros) => {
  const fromMacros = kcalFromMacros(macros);

  if (kcal <= 0) {
    return fromMacros > 0 ? 1 : 0;
  }
  return Math.abs(kcal - fromMacros) / kcal;
};

export const isKcalGapTooLarge = (kcal: number, macros: Macros) =>
  kcalGap(kcal, macros) > FOOD_LIMITS.KCAL_GAP_LIMIT;

// Numbers for `grams` of a food whose values are per 100 g. Grams and macros
// show one decimal, kcal is a whole number.
export const scaleFood = (
  food: Pick<Food, "kcal" | "protein" | "carbs" | "fat">,
  grams: number,
): FoodAmount => {
  const safeGrams = toSafeGrams(grams);
  const factor = safeGrams / 100;

  return {
    grams: roundTo(safeGrams, 1),
    kcal: Math.round(food.kcal * factor),
    protein: roundTo(food.protein * factor, 1),
    carbs: roundTo(food.carbs * factor, 1),
    fat: roundTo(food.fat * factor, 1),
  };
};

export const servingsToGrams = (servings: number, servingGrams: number) =>
  toSafeGrams(servings) * toSafeGrams(servingGrams);

// Percent of the food's calories that come from protein, carbs and fat. Whole
// numbers that always add up to 100 (largest remainder), or all 0 when the
// food has no calories from macros.
export const macroSplit = (macros: Macros): MacroShare => {
  const kcal = {
    protein: macros.protein * KCAL_PER_GRAM.protein,
    carbs: macros.carbs * KCAL_PER_GRAM.carbs,
    fat: macros.fat * KCAL_PER_GRAM.fat,
  };
  const total = kcal.protein + kcal.carbs + kcal.fat;

  if (total <= 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  const keys = ["protein", "carbs", "fat"] as const;
  const exact = keys.map((key) => (kcal[key] / total) * 100);
  const floors = exact.map(Math.floor);
  let missing = 100 - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const { index } of byRemainder) {
    if (missing <= 0) {
      break;
    }
    floors[index] += 1;
    missing -= 1;
  }
  return { protein: floors[0], carbs: floors[1], fat: floors[2] };
};

// "35" -> "35", "46.5" -> "46,5": Vietnamese decimal comma, one decimal.
export const formatGrams = (grams: number, locale: Locale = DEFAULT_LOCALE) =>
  roundTo(grams, 1).toLocaleString(toIntlLocale(locale), {
    maximumFractionDigits: 1,
    useGrouping: false,
  });

export const formatKcal = (kcal: number, locale: Locale = DEFAULT_LOCALE) =>
  Math.round(kcal).toLocaleString(toIntlLocale(locale), {
    useGrouping: false,
  });

// Shown next to the kcal field and as the refusal message.
export const describeKcalGap = (
  kcal: number,
  macros: Macros,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)("kcalGap", {
    entered: formatKcal(kcal, locale),
    percent: Math.round(kcalGap(kcal, macros) * 100),
    computed: formatKcal(kcalFromMacros(macros), locale),
  });
