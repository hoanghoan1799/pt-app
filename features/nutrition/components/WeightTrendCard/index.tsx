import clsx from "clsx";

import { CARD } from "@/constants/styles";
import { WeightChangeStat } from "@/features/nutrition/components/WeightChangeStat";
import { WeightChart } from "@/features/nutrition/components/WeightChart";
import { WeightLogForm } from "@/features/nutrition/components/WeightLogForm";
import { WEIGHT_CHART_WEEKS } from "@/features/nutrition/constants/weight";
import type { WeeklyWeight } from "@/features/nutrition/types/nutrition";
import { formatDecimal } from "@/features/nutrition/utils/energy";
import { getWeightChanges } from "@/features/nutrition/utils/weight";
import { formatWeekRange } from "@/utils/week";

interface WeightTrendCardProps {
  weeks: WeeklyWeight[];
  selectedWeekStart: string;
  // Users log their own weight; the admin only reads.
  canLog: boolean;
  todayWeight: number | null;
}

export const WeightTrendCard = ({
  weeks,
  selectedWeekStart,
  canLog,
  todayWeight,
}: WeightTrendCardProps) => {
  const changes = getWeightChanges(weeks);
  const hasData = changes.latest !== null;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <p className="px-2 py-3 text-center">
          <span className="block text-lg font-bold text-fg tabular-nums">
            {hasData ? `${formatDecimal(changes.latest ?? 0)} kg` : "–"}
          </span>
          <span className="text-xs text-muted">TB tuần gần nhất</span>
        </p>
        <WeightChangeStat
          label="so với tuần trước"
          change={changes.weekChange}
        />
        <WeightChangeStat
          label={`trong ${WEIGHT_CHART_WEEKS} tuần`}
          change={changes.totalChange}
        />
      </div>

      <div className="px-3 pt-3 pb-1">
        {hasData ? (
          <WeightChart weeks={weeks} selectedWeekStart={selectedWeekStart} />
        ) : (
          <p className="px-1 py-8 text-center text-sm text-muted">
            Chưa có số cân nào trong {WEIGHT_CHART_WEEKS} tuần qua.
            {canLog ? " Ghi cân nặng bên dưới để bắt đầu theo dõi." : ""}
          </p>
        )}
      </div>

      {hasData && (
        <details className="group border-t border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-muted">
            Xem dạng bảng
          </summary>
          <table className="w-full text-sm tabular-nums">
            <tbody className="divide-y divide-line">
              {[...weeks].reverse().map((week) => (
                <tr
                  key={week.weekStart}
                  className={clsx(
                    week.weekStart === selectedWeekStart && "bg-line/40",
                  )}
                >
                  <th
                    scope="row"
                    className="px-4 py-2 text-left font-normal text-muted"
                  >
                    {formatWeekRange(week.weekStart)}
                  </th>
                  <td className="px-4 py-2 text-right font-semibold text-fg">
                    {week.averageKg === null
                      ? "–"
                      : `${formatDecimal(week.averageKg)} kg`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {canLog && (
        <div className="border-t border-line p-4">
          <WeightLogForm todayWeight={todayWeight} />
        </div>
      )}
    </div>
  );
};
