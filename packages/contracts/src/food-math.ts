import { FOOD_LIMITS } from "./foods.js";
import { KCAL_PER_GRAM } from "./nutrition.js";

export interface KcalMacros {
  protein: number;
  carbs: number;
  fat: number;
}

// Calories implied by the macros, with the same 4/4/9 factors the targets use.
export const kcalFromMacros = ({ protein, carbs, fat }: KcalMacros) =>
  protein * KCAL_PER_GRAM.protein +
  carbs * KCAL_PER_GRAM.carbs +
  fat * KCAL_PER_GRAM.fat;

// How far the entered kcal is from the macros' kcal, as a share of the entered
// kcal (0.052 = 5.2 %). Zero kcal against non-zero macros counts as 100 %.
export const kcalGap = (kcal: number, macros: KcalMacros) => {
  const fromMacros = kcalFromMacros(macros);

  if (kcal <= 0) {
    return fromMacros > 0 ? 1 : 0;
  }
  return Math.abs(kcal - fromMacros) / kcal;
};

export const isKcalGapTooLarge = (kcal: number, macros: KcalMacros) =>
  kcalGap(kcal, macros) > FOOD_LIMITS.KCAL_GAP_LIMIT;

// The Vietnamese refusal text of the food schema. The web app renders the same
// sentence in every locale through the `format.kcalGap` message; a web test
// keeps the two in step.
export const describeKcalGapVi = (kcal: number, macros: KcalMacros) =>
  `Calo nhập ${Math.round(kcal)} lệch ${Math.round(kcalGap(kcal, macros) * 100)}% so với ${Math.round(kcalFromMacros(macros))} kcal tính từ protein/carb/fat (4/4/9).`;
