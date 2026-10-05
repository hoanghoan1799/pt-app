import {
  WEIGHT_TICK_STEPS,
  WEIGHT_TICK_TARGET,
} from "@/features/nutrition/constants/weight";
import type {
  ChartPoint,
  WeeklyWeight,
  WeightLog,
} from "@/features/nutrition/types/nutrition";
import { addDays, getWeekStart } from "@/utils/week";

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

// The `count` week starts ending with `lastWeekStart`, oldest first.
export const getRecentWeekStarts = (lastWeekStart: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    addDays(lastWeekStart, (index - count + 1) * 7),
  );

export const groupWeightsByWeek = (
  logs: WeightLog[],
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

// Clean y ticks around the data: ~4 ticks on a 0.5 / 1 / 2 / 5 / 10 kg step.
export const getWeightTicks = (values: number[]) => {
  if (!values.length) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const step =
    WEIGHT_TICK_STEPS.find(
      (candidate) => range / candidate <= WEIGHT_TICK_TARGET,
    ) ?? WEIGHT_TICK_STEPS[WEIGHT_TICK_STEPS.length - 1];
  const start = Math.floor((min - step / 2) / step) * step;
  const end = Math.ceil((max + step / 2) / step) * step;
  const ticks: number[] = [];

  for (let tick = start; tick <= end + step / 1000; tick += step) {
    ticks.push(roundToTenth(tick));
  }
  return ticks;
};

interface PlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Maps weeks onto the plot area; weeks without data produce no point.
export const toChartPoints = (
  weeks: WeeklyWeight[],
  ticks: number[],
  area: PlotArea,
): ChartPoint[] => {
  const [minTick, maxTick] = [ticks[0], ticks[ticks.length - 1]];
  const xStep =
    weeks.length > 1 ? (area.right - area.left) / (weeks.length - 1) : 0;

  return weeks.flatMap((week, index) =>
    week.averageKg === null
      ? []
      : [
          {
            index,
            x: area.left + index * xStep,
            y:
              area.bottom -
              ((week.averageKg - minTick) / (maxTick - minTick)) *
                (area.bottom - area.top),
            value: week.averageKg,
          },
        ],
  );
};

export const getWeekX = (index: number, count: number, area: PlotArea) =>
  area.left +
  (count > 1 ? (index * (area.right - area.left)) / (count - 1) : 0);

export const getTickY = (tick: number, ticks: number[], area: PlotArea) => {
  const [minTick, maxTick] = [ticks[0], ticks[ticks.length - 1]];

  return (
    area.bottom -
    ((tick - minTick) / (maxTick - minTick)) * (area.bottom - area.top)
  );
};

// The week whose x position is closest to the pointer (crosshair snapping).
export const findNearestPoint = (points: ChartPoint[], x: number) =>
  points.reduce<ChartPoint | null>(
    (nearest, point) =>
      !nearest || Math.abs(point.x - x) < Math.abs(nearest.x - x)
        ? point
        : nearest,
    null,
  );

// "+0,4 kg" / "−1,2 kg" / "0 kg"
export const formatWeightChange = (change: number) => {
  const magnitude = Math.abs(change).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
  });

  if (change > 0) {
    return `+${magnitude} kg`;
  }
  return change < 0 ? `−${magnitude} kg` : "0 kg";
};
