import {
  KCAL_PER_GRAM,
  ON_TARGET,
} from "@/features/nutrition/constants/energy";
import { MACROS } from "@/features/nutrition/constants/nutrition";
import type {
  ComparedMetric,
  EatenAmounts,
  FoodEntry,
  Macro,
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

// A day from the old free-text entries and what the meal plan counts as eaten
// (KAN-71, KAN-87): one part per logged food, or per planned food of a meal
// marked "Đạt". Totals are whole grams and whole kcal.
export const buildNutritionDay = (
  date: string,
  target: NutritionTarget | null,
  entries: FoodEntry[],
  mealLogs: EatenAmounts[],
): NutritionDay => {
  const fromEntries = sumEntries(entries);
  const sum = (macro: Macro) =>
    Math.round(
      mealLogs.reduce((total, log) => total + log[macro], fromEntries[macro]),
    );

  return {
    date,
    target,
    entries,
    loggedCount: entries.length + mealLogs.length,
    totals: { carbs: sum("carbs"), protein: sum("protein"), fat: sum("fat") },
    totalKcal: Math.round(
      mealLogs.reduce((total, log) => total + log.kcal, 0) +
        calculateCalories(fromEntries),
    ),
  };
};

// Targets sorted by effectiveFrom ascending; the latest one that started on
// or before the date applies. A day before the first target uses the first
// one (KAN-90): a target saved today must also cover the earlier days of the
// week the PT is planning, not leave them "without a target".
export const findTargetForDate = (targets: NutritionTarget[], date: string) =>
  targets.reduce<NutritionTarget | null>(
    (current, target) => (target.effectiveFrom <= date ? target : current),
    null,
  ) ??
  targets[0] ??
  null;

// Calories follow from the macros: 4 kcal/g carbs and protein, 9 kcal/g fat.
export const calculateCalories = ({ carbs, protein, fat }: MacroAmounts) =>
  carbs * KCAL_PER_GRAM.carbs +
  protein * KCAL_PER_GRAM.protein +
  fat * KCAL_PER_GRAM.fat;

// How far below / above the target still counts as "on", per metric (ON_TARGET).
// Protein has no upper bound: eating more than the target is fine.
const ON_TARGET_RANGE: Record<
  ComparedMetric,
  { below: number; above: number }
> = {
  kcal: { below: ON_TARGET.kcalDiff, above: ON_TARGET.kcalDiff },
  protein: { below: ON_TARGET.proteinUnder, above: Infinity },
  carbs: { below: ON_TARGET.carbsFat, above: ON_TARGET.carbsFat },
  fat: { below: ON_TARGET.carbsFat, above: ON_TARGET.carbsFat },
};

// `metric` is a macro in grams or "kcal"; the rule is ON_TARGET.
export const compareToTarget = (
  actual: number,
  target: number | undefined,
  metric: ComparedMetric,
): MacroComparison => {
  if (!target) {
    return { status: "none", difference: 0, percent: 0 };
  }

  const percent = calculatePercent(actual, target);
  const { below, above } = ON_TARGET_RANGE[metric];

  if (actual < target - below) {
    return { status: "under", difference: target - actual, percent };
  }
  if (actual > target + above) {
    return { status: "over", difference: actual - target, percent };
  }
  return { status: "on", difference: Math.abs(actual - target), percent };
};

// Share of the target eaten, clamped to 0-100 for a progress ring; 0 without
// a target or for bad numbers.
export const getRingPercent = (eaten: number, target?: number) => {
  if (!target || target <= 0 || !Number.isFinite(eaten) || eaten <= 0) {
    return 0;
  }

  return Math.min(100, Math.round(calculatePercent(eaten, target)));
};

// A logged day is on target when kcal (4/4/9 from the macros), protein, carbs
// and fat are all "on"; macros without a target are ignored.
export const isDayOnTarget = (day: NutritionDay) => {
  const { target, totals, totalKcal, loggedCount } = day;

  if (!target || !loggedCount) {
    return false;
  }

  const isOn = (actual: number, goal: number, metric: ComparedMetric) => {
    const { status } = compareToTarget(actual, goal, metric);

    return status === "on" || status === "none";
  };

  return (
    isOn(totalKcal, calculateCalories(target), "kcal") &&
    MACROS.every((macro) => isOn(totals[macro], target[macro], macro))
  );
};

export const summarizeNutritionWeek = (
  days: NutritionDay[],
): NutritionWeekSummary => {
  const loggedDays = days.filter((day) => day.loggedCount > 0);
  const totals = loggedDays.reduce(
    (sum, day) => ({
      carbs: sum.carbs + day.totals.carbs,
      protein: sum.protein + day.totals.protein,
      fat: sum.fat + day.totals.fat,
    }),
    EMPTY_AMOUNTS,
  );
  const totalKcal = loggedDays.reduce((sum, day) => sum + day.totalKcal, 0);
  const divisor = loggedDays.length || 1;

  return {
    loggedDays: loggedDays.length,
    averages: {
      carbs: Math.round(totals.carbs / divisor),
      protein: Math.round(totals.protein / divisor),
      fat: Math.round(totals.fat / divisor),
    },
    averageKcal: Math.round(totalKcal / divisor),
    onTargetDays: days.filter(isDayOnTarget).length,
  };
};
