import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";

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
  const locale = useLocale();
  const t = useTranslations("nutrition.weightTrendCard");
  const changes = getWeightChanges(weeks);
  const hasData = changes.latest !== null;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <p className="px-2 py-3 text-center">
          <span className="block text-lg font-bold text-fg tabular-nums">
            {hasData ? `${formatDecimal(changes.latest ?? 0, locale)} kg` : "–"}
          </span>
          <span className="text-xs text-muted">{t("latestAverage")}</span>
        </p>
        <WeightChangeStat label={t("vsLastWeek")} change={changes.weekChange} />
        <WeightChangeStat
          label={t("inWeeks", { weeks: WEIGHT_CHART_WEEKS })}
          change={changes.totalChange}
        />
      </div>

      <div className="px-3 pt-3 pb-1">
        {hasData ? (
          <WeightChart weeks={weeks} selectedWeekStart={selectedWeekStart} />
        ) : (
          <p className="px-1 py-8 text-center text-sm text-muted">
            {t("empty", { weeks: WEIGHT_CHART_WEEKS })}
            {canLog ? ` ${t("emptyLogHint")}` : ""}
          </p>
        )}
      </div>

      {hasData && (
        <details className="group border-t border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-muted">
            {t("viewAsTable")}
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
                    {formatWeekRange(week.weekStart, locale)}
                  </th>
                  <td className="px-4 py-2 text-right font-semibold text-fg">
                    {week.averageKg === null
                      ? "–"
                      : `${formatDecimal(week.averageKg, locale)} kg`}
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
