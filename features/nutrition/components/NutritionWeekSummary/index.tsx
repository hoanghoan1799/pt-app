import clsx from "clsx";
import Link from "next/link";

import { CARD } from "@/constants/styles";
import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
} from "@/features/nutrition/constants/nutrition";
import type { NutritionDay } from "@/features/nutrition/types/nutrition";
import {
  calculateCalories,
  formatCalories,
} from "@/features/nutrition/utils/energy";
import {
  compareToTarget,
  summarizeNutritionWeek,
} from "@/features/nutrition/utils/nutrition";
import {
  buildScheduleHref,
  formatDayMonth,
  getWeekdayShortLabel,
} from "@/utils/week";

interface NutritionWeekSummaryProps {
  days: NutritionDay[];
  weekStart: string;
  // Each row links to that day on the nutrition tab.
  dayBasePath: string;
}

const STATUS_CLASSES = {
  none: "text-fg",
  under: "text-fg",
  on: "font-semibold text-success",
  over: "font-semibold text-danger",
};

export const NutritionWeekSummary = ({
  days,
  weekStart,
  dayBasePath,
}: NutritionWeekSummaryProps) => {
  const summary = summarizeNutritionWeek(days);
  const stats = [
    {
      value: `${summary.loggedDays}/7`,
      label: "ngày có ghi",
      className: "text-fg",
    },
    {
      value: String(summary.onTargetDays),
      label: "ngày đạt mục tiêu",
      className: "text-success",
    },
    {
      value: summary.loggedDays
        ? formatCalories(calculateCalories(summary.averages))
        : "–",
      label: "TB/ngày",
      className: "text-fg",
    },
  ];

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
        {stats.map((stat) => (
          <p key={stat.label} className="px-2 py-3">
            <span
              className={clsx(
                "block text-lg font-bold tabular-nums",
                stat.className,
              )}
            >
              {stat.value}
            </span>
            <span className="text-xs text-muted">{stat.label}</span>
          </p>
        ))}
      </div>
      <div
        role="table"
        aria-label="Dinh dưỡng theo ngày"
        className="text-sm tabular-nums"
      >
        <div
          role="row"
          className="grid grid-cols-[1fr_repeat(3,4.5rem)] px-4 py-2 text-xs"
        >
          <span role="columnheader" className="font-medium text-muted">
            Ngày
          </span>
          {MACROS.map((macro) => (
            <span
              key={macro}
              role="columnheader"
              className={clsx(
                "text-right font-semibold",
                MACRO_COLORS[macro].text,
              )}
            >
              {MACRO_LABELS[macro].name}
            </span>
          ))}
        </div>
        {days.map((day) => (
          <Link
            key={day.date}
            role="row"
            href={buildScheduleHref(dayBasePath, {
              weekStart,
              selectedDate: day.date,
            })}
            className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-baseline border-t border-line px-4 py-2.5 transition active:bg-line/60"
          >
            <span role="rowheader" className="font-medium text-fg">
              {getWeekdayShortLabel(day.date)}{" "}
              <span className="font-normal text-muted">
                {formatDayMonth(day.date)}
              </span>
            </span>
            {MACROS.map((macro) => (
              <span
                key={macro}
                role="cell"
                className={clsx(
                  "text-right",
                  day.entries.length
                    ? STATUS_CLASSES[
                        compareToTarget(day.totals[macro], day.target?.[macro])
                          .status
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
              </span>
            ))}
          </Link>
        ))}
        <div
          role="row"
          className="grid grid-cols-[1fr_repeat(3,4.5rem)] border-t border-line bg-line/40 px-4 py-2.5"
        >
          <span role="rowheader" className="font-semibold text-fg">
            TB/ngày
          </span>
          {MACROS.map((macro) => (
            <span
              key={macro}
              role="cell"
              className="text-right font-semibold text-fg"
            >
              {summary.loggedDays ? summary.averages[macro] : "–"}
            </span>
          ))}
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        Gram đã ăn / mục tiêu. <span className="text-success">Xanh</span>: đạt
        (±10%), <span className="text-danger">đỏ</span>: vượt. Bấm vào ngày để
        xem chi tiết.
      </p>
    </div>
  );
};
