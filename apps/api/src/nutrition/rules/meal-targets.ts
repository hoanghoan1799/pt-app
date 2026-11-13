import { calculateCalories, MACROS } from "./nutrition-math.js";
import type { MacroAmounts } from "./types.js";

// Total of the meal shares when the PT splits the day by percent (Q4).
export const SHARE_TOTAL_PERCENT = 100;

export interface MealTarget extends MacroAmounts {
  kcal: number;
}

export type SplitResult =
  | { ok: true; meals: MealTarget[] }
  | { ok: false; reason: "mixed" | "range" | "total" };

const SHARE_TOLERANCE = 1e-6;

// Whole grams per meal that add up to exactly `total` (largest remainder, the
// earlier meal wins a tie): 100 g over 3 meals is 34 / 33 / 33.
const splitWhole = (total: number, shares: number[]) => {
  const exact = shares.map((share) => (total * share) / SHARE_TOTAL_PERCENT);
  const floors = exact.map(Math.floor);
  let missing = Math.round(total) - floors.reduce((sum, v) => sum + v, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of byRemainder) {
    if (missing <= 0) {
      break;
    }
    floors[index] += 1;
    missing -= 1;
  }
  return floors;
};

// Splits the day's macro target across meals (Q4). `shares` is the percent of
// each meal in order: all null = equal split; otherwise every meal needs one,
// each above 0, adding up to 100.
export const splitDayTarget = (
  target: MacroAmounts,
  shares: (number | null)[],
): SplitResult => {
  if (shares.length === 0) {
    return { ok: true, meals: [] };
  }

  const isEqual = shares.every((share) => share === null);

  if (!isEqual && shares.some((share) => share === null)) {
    return { ok: false, reason: "mixed" };
  }

  const percents = isEqual
    ? shares.map(() => SHARE_TOTAL_PERCENT / shares.length)
    : (shares as number[]);

  if (percents.some((percent) => !Number.isFinite(percent) || percent <= 0)) {
    return { ok: false, reason: "range" };
  }
  if (
    Math.abs(percents.reduce((sum, v) => sum + v, 0) - SHARE_TOTAL_PERCENT) >
    SHARE_TOLERANCE
  ) {
    return { ok: false, reason: "total" };
  }

  const perMacro = Object.fromEntries(
    MACROS.map((macro) => [macro, splitWhole(target[macro], percents)]),
  ) as Record<keyof MacroAmounts, number[]>;

  return {
    ok: true,
    meals: percents.map((_, index) => {
      const macros = {
        carbs: perMacro.carbs[index],
        protein: perMacro.protein[index],
        fat: perMacro.fat[index],
      };

      return { ...macros, kcal: calculateCalories(macros) };
    }),
  };
};
