import clsx from "clsx";

import { CARD, SECTION_TITLE } from "@/constants/styles";
import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
} from "@/features/nutrition/constants/nutrition";
import type { NutritionDay } from "@/features/nutrition/types/nutrition";
import {
  compareToTarget,
  summarizeNutritionWeek,
} from "@/features/nutrition/utils/nutrition";
import { formatDayMonth, getWeekdayShortLabel } from "@/utils/week";

interface NutritionWeekSummaryProps {
  days: NutritionDay[];
}

const STATUS_CLASSES = {
  none: "text-fg",
  under: "text-fg",
  on: "font-semibold text-success",
  over: "font-semibold text-danger",
};

export const NutritionWeekSummary = ({ days }: NutritionWeekSummaryProps) => {
  const summary = summarizeNutritionWeek(days);

  return (
    <section className="space-y-2">
      <h2 className={SECTION_TITLE}>Tổng kết tuần</h2>
      <div className={`${CARD} overflow-hidden`}>
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
          <p className="px-2 py-3">
            <span className="block text-xl font-bold text-fg tabular-nums">
              {summary.loggedDays}/7
            </span>
            <span className="text-xs text-muted">ngày có ghi</span>
          </p>
          <p className="px-2 py-3">
            <span className="block text-xl font-bold text-success tabular-nums">
              {summary.onTargetDays}
            </span>
            <span className="text-xs text-muted">ngày đạt mục tiêu</span>
          </p>
          <p className="px-2 py-3">
            <span className="block text-xl font-bold text-fg tabular-nums">
              {summary.averages.protein} g
            </span>
            <span className="text-xs text-muted">protein TB/ngày</span>
          </p>
        </div>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Ngày
              </th>
              {MACROS.map((macro) => (
                <th
                  key={macro}
                  scope="col"
                  className={clsx(
                    "px-2 py-2 text-right font-semibold",
                    MACRO_COLORS[macro].text,
                  )}
                >
                  {MACRO_LABELS[macro].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((day) => (
              <tr key={day.date}>
                <th
                  scope="row"
                  className="px-4 py-2 text-left font-medium text-fg"
                >
                  {getWeekdayShortLabel(day.date)}{" "}
                  <span className="font-normal text-muted">
                    {formatDayMonth(day.date)}
                  </span>
                </th>
                {MACROS.map((macro) => (
                  <td
                    key={macro}
                    className={clsx(
                      "px-2 py-2 text-right",
                      day.entries.length
                        ? STATUS_CLASSES[
                            compareToTarget(
                              day.totals[macro],
                              day.target?.[macro],
                            ).status
                          ]
                        : "text-muted",
                    )}
                  >
                    {day.entries.length ? day.totals[macro] : "–"}
                    {day.target && day.entries.length ? (
                      <span className="text-xs font-normal text-muted">
                        /{day.target[macro]}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-line/40">
              <th
                scope="row"
                className="px-4 py-2 text-left font-semibold text-fg"
              >
                TB/ngày
              </th>
              {MACROS.map((macro) => (
                <td
                  key={macro}
                  className="px-2 py-2 text-right font-semibold text-fg"
                >
                  {summary.loggedDays ? summary.averages[macro] : "–"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Số gram đã ăn / mục tiêu. <span className="text-success">Xanh</span>:
          đạt (±10%), <span className="text-danger">đỏ</span>: vượt.
        </p>
      </div>
    </section>
  );
};
