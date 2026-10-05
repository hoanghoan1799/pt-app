import type { PointerEvent } from "react";

import {
  WEIGHT_CHART,
  WEIGHT_PLOT_AREA,
} from "@/features/nutrition/constants/weight";
import type {
  ChartPoint,
  WeeklyWeight,
} from "@/features/nutrition/types/nutrition";
import { formatDecimal } from "@/features/nutrition/utils/energy";
import { getTickY, getWeekX } from "@/features/nutrition/utils/weight";
import { formatDayMonth, formatWeekRange } from "@/utils/week";

interface WeightChartViewProps {
  weeks: WeeklyWeight[];
  selectedWeekStart: string;
  ticks: number[];
  points: ChartPoint[];
  activePoint: ChartPoint | null;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
}

const { WIDTH, HEIGHT, MARKER_RADIUS, X_LABEL_EVERY } = WEIGHT_CHART;

const toPath = (points: ChartPoint[]) =>
  points
    .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
    .join(" ");

// Single series, so no legend: the card title names it. Axis text and values
// use text tokens; only the line and markers carry the series color.
export const WeightChartView = ({
  weeks,
  selectedWeekStart,
  ticks,
  points,
  activePoint,
  onPointerMove,
  onPointerLeave,
}: WeightChartViewProps) => {
  const lastPoint = points.at(-1);
  const previousPoint = points.at(-2);
  // Put the end label on the side the line isn't coming from.
  const isLineFalling = Boolean(
    previousPoint && lastPoint && previousPoint.y < lastPoint.y,
  );
  const activeWeek = activePoint ? weeks[activePoint.index] : null;
  const tooltipLeft = activePoint ? `${(activePoint.x / WIDTH) * 100}%` : "0";

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full touch-pan-y select-none"
        role="img"
        aria-label="Biểu đồ cân nặng trung bình theo tuần"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {ticks.map((tick) => {
          const y = getTickY(tick, ticks, WEIGHT_PLOT_AREA);

          return (
            <g key={tick}>
              <line
                x1={WEIGHT_PLOT_AREA.left}
                x2={WEIGHT_PLOT_AREA.right}
                y1={y}
                y2={y}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={WEIGHT_PLOT_AREA.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted text-[10px] tabular-nums"
              >
                {formatDecimal(tick)}
              </text>
            </g>
          );
        })}

        {weeks.map((week, index) =>
          index % X_LABEL_EVERY === (weeks.length - 1) % X_LABEL_EVERY ? (
            <text
              key={week.weekStart}
              x={getWeekX(index, weeks.length, WEIGHT_PLOT_AREA)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className={
                week.weekStart === selectedWeekStart
                  ? "fill-fg text-[10px] font-semibold"
                  : "fill-muted text-[10px]"
              }
            >
              {formatDayMonth(week.weekStart)}
            </text>
          ) : null,
        )}

        {activePoint && (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={WEIGHT_PLOT_AREA.top}
            y2={WEIGHT_PLOT_AREA.bottom}
            className="stroke-muted"
            strokeWidth={1}
          />
        )}

        {points.length > 1 && (
          <path
            d={toPath(points)}
            fill="none"
            className="stroke-chart-weight"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((point) => {
          const isHighlighted =
            point.index === activePoint?.index ||
            weeks[point.index].weekStart === selectedWeekStart;

          return (
            <circle
              key={point.index}
              cx={point.x}
              cy={point.y}
              r={isHighlighted ? MARKER_RADIUS + 1.5 : MARKER_RADIUS}
              className="fill-chart-weight stroke-surface"
              strokeWidth={2}
            />
          );
        })}

        {lastPoint && !activePoint && (
          <text
            x={lastPoint.x}
            y={isLineFalling ? lastPoint.y + 18 : lastPoint.y - 10}
            textAnchor="end"
            className="fill-fg text-[11px] font-semibold tabular-nums"
          >
            {formatDecimal(lastPoint.value)} kg
          </text>
        )}
      </svg>

      {activePoint && activeWeek && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-center shadow-lg"
          style={{ left: `clamp(70px, ${tooltipLeft}, calc(100% - 70px))` }}
        >
          <p className="text-base leading-tight font-bold text-fg tabular-nums">
            {formatDecimal(activePoint.value)} kg
          </p>
          <p className="text-[11px] whitespace-nowrap text-muted">
            Tuần {formatWeekRange(activeWeek.weekStart)} · {activeWeek.count}{" "}
            lần cân
          </p>
        </div>
      )}
    </div>
  );
};
