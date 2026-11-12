import { addDays, getWeekStart } from "@pt/contracts";

import type { WeeklyWeight, WeightPoint } from "./types.js";

export const WEIGHT_CHART_WEEKS = 12;

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

// The `count` week starts ending with `lastWeekStart`, oldest first.
export const getRecentWeekStarts = (lastWeekStart: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    addDays(lastWeekStart, (index - count + 1) * 7),
  );

export const groupWeightsByWeek = (
  logs: WeightPoint[],
  weekStarts: string[],
): WeeklyWeight[] =>
  weekStarts.map((weekStart) => {
    const inWeek = logs.filter((log) => getWeekStart(log.date) === weekStart);
    const total = inWeek.reduce((sum, log) => sum + log.weightKg, 0);

    return {
      weekStart,
      averageKg: inWeek.length ? roundToTenth(total / inWeek.length) : null,
      count: inWeek.length,
    };
  });

// Change between the last two weeks that have data, and over the whole range.
export const getWeightChanges = (weeks: WeeklyWeight[]) => {
  const values = weeks.flatMap((week) =>
    week.averageKg === null ? [] : [week.averageKg],
  );
  const latest = values.at(-1) ?? null;
  const previous = values.at(-2) ?? null;
  const first = values[0] ?? null;

  return {
    latest,
    weekChange:
      latest !== null && previous !== null
        ? roundToTenth(latest - previous)
        : null,
    totalChange:
      latest !== null && first !== null && values.length > 1
        ? roundToTenth(latest - first)
        : null,
  };
};
