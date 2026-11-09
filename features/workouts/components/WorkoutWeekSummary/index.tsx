import clsx from "clsx";
import { BedDouble, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ProgressBar } from "@/components/common/ProgressBar";
import { CARD } from "@/constants/styles";
import type { ScheduleDay } from "@/features/workouts/types/workout";
import {
  getDayProgress,
  getWeekProgress,
  isDayComplete,
} from "@/features/workouts/utils/progress";
import {
  buildScheduleHref,
  formatDayMonth,
  getWeekdayShortLabel,
} from "@/utils/week";

interface WorkoutWeekSummaryProps {
  days: ScheduleDay[];
  weekStart: string;
  today: string;
  // Each row links to that day on the workouts tab.
  dayBasePath: string;
}

export const WorkoutWeekSummary = ({
  days,
  weekStart,
  today,
  dayBasePath,
}: WorkoutWeekSummaryProps) => {
  const t = useTranslations("workouts.weekSummary");
  const week = getWeekProgress(days);
  const plannedDays = days.filter((day) => day.exercises.length > 0);
  const completedDays = plannedDays.filter(isDayComplete).length;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="space-y-2 border-b border-line p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">
            {t("sessionsDone", {
              completed: completedDays,
              total: plannedDays.length,
            })}
          </span>
          <span className="font-bold text-fg tabular-nums">
            {t("exerciseSummary", {
              completed: week.completed,
              total: week.total,
              percent: week.percent,
            })}
          </span>
        </div>
        <ProgressBar percent={week.percent} label={t("progressLabel")} />
      </div>
      <ul>
        {days.map((day) => {
          const progress = getDayProgress(day);
          const isDone = isDayComplete(day);
          const isMissed = !isDone && progress.total > 0 && day.date < today;

          return (
            <li
              key={day.date}
              className="border-t border-line first:border-t-0"
            >
              <Link
                href={buildScheduleHref(dayBasePath, {
                  weekStart,
                  selectedDate: day.date,
                })}
                className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition active:bg-line/60"
              >
                <span className="w-16 shrink-0 text-sm font-medium text-fg">
                  {getWeekdayShortLabel(day.date)}{" "}
                  <span className="font-normal text-muted">
                    {formatDayMonth(day.date)}
                  </span>
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">
                  {progress.total
                    ? day.title || t("exerciseCount", { count: progress.total })
                    : t("restDay")}
                </span>
                {progress.total ? (
                  <span
                    className={clsx(
                      "flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums",
                      isDone && "text-success",
                      isMissed && "text-danger",
                      !isDone && !isMissed && "text-fg",
                    )}
                  >
                    {isDone && (
                      <Check className="size-4" strokeWidth={3} aria-hidden />
                    )}
                    {progress.completed}/{progress.total}
                  </span>
                ) : (
                  <BedDouble
                    className="size-4 shrink-0 text-muted"
                    aria-label={t("restDayLabel")}
                  />
                )}
                <ChevronRight
                  className="size-4 shrink-0 text-muted"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
