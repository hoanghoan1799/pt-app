"use client";

import { WeightChartView } from "@/features/nutrition/components/WeightChartView";
import { useWeightChart } from "@/features/nutrition/hooks/use-weight-chart";
import type { WeeklyWeight } from "@/features/nutrition/types/nutrition";

interface WeightChartProps {
  weeks: WeeklyWeight[];
  selectedWeekStart: string;
}

export const WeightChart = ({ weeks, selectedWeekStart }: WeightChartProps) => {
  const chart = useWeightChart(weeks);

  return (
    <WeightChartView
      weeks={weeks}
      selectedWeekStart={selectedWeekStart}
      ticks={chart.ticks}
      points={chart.points}
      activePoint={chart.activePoint}
      onPointerMove={chart.handlePointerMove}
      onPointerLeave={chart.handlePointerLeave}
    />
  );
};
