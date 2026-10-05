"use client";

import { type PointerEvent, useState } from "react";

import {
  WEIGHT_CHART,
  WEIGHT_PLOT_AREA,
} from "@/features/nutrition/constants/weight";
import type { WeeklyWeight } from "@/features/nutrition/types/nutrition";
import {
  findNearestPoint,
  getWeightTicks,
  toChartPoints,
} from "@/features/nutrition/utils/weight";

export const useWeightChart = (weeks: WeeklyWeight[]) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const values = weeks.flatMap((week) =>
    week.averageKg === null ? [] : [week.averageKg],
  );
  const ticks = getWeightTicks(values);
  const points = ticks.length
    ? toChartPoints(weeks, ticks, WEIGHT_PLOT_AREA)
    : [];

  // The crosshair snaps to the week nearest the pointer; touch drags work too.
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WEIGHT_CHART.WIDTH;

    setActiveIndex(findNearestPoint(points, x)?.index ?? null);
  };

  return {
    ticks,
    points,
    activePoint: points.find((point) => point.index === activeIndex) ?? null,
    handlePointerMove,
    handlePointerLeave: () => setActiveIndex(null),
  };
};
