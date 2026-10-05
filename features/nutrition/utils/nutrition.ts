import {
  GRAMS_PER_LANG,
  MACROS,
  TARGET_TOLERANCE,
} from "@/features/nutrition/constants/nutrition";
import type {
  FoodEntry,
  MacroAmounts,
  MacroComparison,
  NutritionDay,
  NutritionTarget,
  NutritionWeekSummary,
} from "@/features/nutrition/types/nutrition";
import { calculatePercent } from "@/utils/time";

const EMPTY_AMOUNTS: MacroAmounts = { carbs: 0, protein: 0, fat: 0 };

export const sumEntries = (entries: FoodEntry[]): MacroAmounts =>
  entries.reduce(
    (sum, entry) => ({
      carbs: sum.carbs + (entry.carbs ?? 0),
      protein: sum.protein + (entry.protein ?? 0),
      fat: sum.fat + (entry.fat ?? 0),
    }),
    EMPTY_AMOUNTS,
  );

// Targets sorted by effectiveFrom ascending; the latest one that started on
// or before the date applies.
export const findTargetForDate = (targets: NutritionTarget[], date: string) =>
  targets.reduce<NutritionTarget | null>(
    (current, target) => (target.effectiveFrom <= date ? target : current),
    null,
  );

export const compareToTarget = (
  actual: number,
  target: number | undefined,
): MacroComparison => {
  if (!target) {
    return { status: "none", difference: 0, percent: 0 };
  }

  const percent = calculatePercent(actual, target);

  if (actual < target * (1 - TARGET_TOLERANCE)) {
    return { status: "under", difference: target - actual, percent };
  }
  if (actual > target * (1 + TARGET_TOLERANCE)) {
    return { status: "over", difference: actual - target, percent };
  }
  return { status: "on", difference: Math.abs(actual - target), percent };
};

export const isDayOnTarget = (day: NutritionDay) =>
  Boolean(day.target && day.entries.length) &&
  MACROS.every((macro) => {
    const { status } = compareToTarget(day.totals[macro], day.target?.[macro]);

    return status === "on" || status === "none";
  });

export const summarizeNutritionWeek = (
  days: NutritionDay[],
): NutritionWeekSummary => {
  const loggedDays = days.filter((day) => day.entries.length > 0);
  const totals = loggedDays.reduce(
    (sum, day) => ({
      carbs: sum.carbs + day.totals.carbs,
      protein: sum.protein + day.totals.protein,
      fat: sum.fat + day.totals.fat,
    }),
    EMPTY_AMOUNTS,
  );
  const divisor = loggedDays.length || 1;

  return {
    loggedDays: loggedDays.length,
    averages: {
      carbs: Math.round(totals.carbs / divisor),
      protein: Math.round(totals.protein / divisor),
      fat: Math.round(totals.fat / divisor),
    },
    onTargetDays: days.filter(isDayOnTarget).length,
  };
};

// 250 → "2,5 lạng"
export const formatLang = (grams: number) =>
  `${(grams / GRAMS_PER_LANG).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} lạng`;
