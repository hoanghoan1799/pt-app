import type { ReactNode } from "react";

import type { ScheduleDay } from "@/features/workouts/types/workout";
import { formatFullDay } from "@/features/workouts/utils/week";

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
  const count = day.exercises.length;

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted">
          {formatFullDay(day.date)}
          {isToday && <span className="text-accent"> · Hôm nay</span>}
          {count > 0 && ` · ${count} bài`}
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
