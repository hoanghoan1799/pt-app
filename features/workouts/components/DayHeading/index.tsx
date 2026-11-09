import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { ScheduleDay } from "@/features/workouts/types/workout";
import { getDayProgress } from "@/features/workouts/utils/progress";
import { formatFullDay } from "@/utils/week";

interface DayHeadingProps {
  day: ScheduleDay;
  isToday: boolean;
  fallbackTitle: string;
  action?: ReactNode;
}

export const DayHeading = ({
  day,
  isToday,
  fallbackTitle,
  action,
}: DayHeadingProps) => {
  const locale = useLocale();
  const t = useTranslations("workouts.dayHeading");
  const tWeek = useTranslations("common.week");
  const { completed, total } = getDayProgress(day);

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted">
          {formatFullDay(day.date, locale)}
          {isToday && <span className="text-accent"> · {tWeek("today")}</span>}
          {total > 0 &&
            ` · ${completed > 0 ? t("progressDone", { completed, total }) : t("exerciseCount", { count: total })}`}
        </p>
        <h2 className="mt-0.5 text-2xl leading-tight font-bold text-balance text-fg">
          {day.title || fallbackTitle}
        </h2>
        {day.note && (
          <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-muted">
            {day.note}
          </p>
        )}
      </div>
      {action}
    </div>
  );
};
