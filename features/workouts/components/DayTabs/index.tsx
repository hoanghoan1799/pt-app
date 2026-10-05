import clsx from "clsx";
import Link from "next/link";

import type { ScheduleDay } from "@/features/workouts/types/workout";
import { hasDayContent } from "@/features/workouts/utils/schedule";
import {
  buildScheduleHref,
  formatDayNumber,
  formatFullDay,
  getWeekdayShortLabel,
} from "@/features/workouts/utils/week";

interface DayTabsProps {
  basePath: string;
  weekStart: string;
  days: ScheduleDay[];
  selectedDate: string;
  today: string;
}

export const DayTabs = ({
  basePath,
  weekStart,
  days,
  selectedDate,
  today,
}: DayTabsProps) => (
  <div className="grid grid-cols-7 gap-1">
    {days.map((day) => {
      const isSelected = day.date === selectedDate;
      const isToday = day.date === today;

      return (
        <Link
          key={day.date}
          href={buildScheduleHref(basePath, {
            weekStart,
            selectedDate: day.date,
          })}
          scroll={false}
          aria-current={isSelected ? "date" : undefined}
          aria-label={`${formatFullDay(day.date)}${hasDayContent(day) ? `, ${day.exercises.length} bài` : ""}`}
          className={clsx(
            "relative flex h-[68px] flex-col items-center justify-center rounded-2xl border transition active:scale-95",
            isSelected
              ? "border-accent bg-accent text-accent-fg shadow-md shadow-accent/25"
              : "border-line bg-surface text-fg",
            isToday && !isSelected && "border-accent/60 text-accent",
          )}
        >
          <span className="text-[11px] font-semibold opacity-75">
            {getWeekdayShortLabel(day.date)}
          </span>
          <span className="mt-0.5 text-lg leading-none font-bold">
            {formatDayNumber(day.date)}
          </span>
          {day.exercises.length > 0 && (
            <span
              className={clsx(
                "absolute bottom-2 size-1.5 rounded-full",
                isSelected ? "bg-accent-fg" : "bg-accent",
              )}
            />
          )}
        </Link>
      );
    })}
  </div>
);
