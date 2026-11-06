import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  buildScheduleHref,
  formatWeekTitle,
  getWeekStart,
  shiftSchedule,
} from "@/utils/week";

interface WeekNavigatorProps {
  basePath: string;
  weekStart: string;
  selectedDate: string;
  today: string;
}

const CONTROL =
  "inline-flex h-9 items-center justify-center rounded-lg text-muted transition active:bg-line";

// Week header: the week range on the left, previous / today / next on the right.
export const WeekNavigator = ({
  basePath,
  weekStart,
  selectedDate,
  today,
}: WeekNavigatorProps) => {
  // Nothing to jump to when today is already the selected day.
  const isOnToday = selectedDate === today;
  const previousHref = buildScheduleHref(
    basePath,
    shiftSchedule(selectedDate, -1),
  );
  const nextHref = buildScheduleHref(basePath, shiftSchedule(selectedDate, 1));
  const todayHref = buildScheduleHref(basePath, {
    weekStart: getWeekStart(today),
    selectedDate: today,
  });

  return (
    <nav
      aria-label="Chọn tuần"
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"
    >
      <p className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-fg">
        <CalendarDays className="size-5 shrink-0 text-accent" aria-hidden />
        {formatWeekTitle(weekStart)}
      </p>
      <div className="flex items-center">
        <Link
          href={previousHref}
          scroll={false}
          className={clsx(CONTROL, "w-8")}
          aria-label="Tuần trước"
        >
          <ChevronLeft className="size-5" />
        </Link>
        {isOnToday ? (
          <span
            aria-disabled="true"
            className="inline-flex h-9 items-center px-1.5 text-sm font-semibold text-muted"
          >
            Hôm nay
          </span>
        ) : (
          <Link
            href={todayHref}
            scroll={false}
            className={clsx(
              CONTROL,
              "px-1.5 text-sm font-semibold text-accent",
            )}
          >
            Hôm nay
          </Link>
        )}
        <Link
          href={nextHref}
          scroll={false}
          className={clsx(CONTROL, "w-8")}
          aria-label="Tuần sau"
        >
          <ChevronRight className="size-5" />
        </Link>
      </div>
    </nav>
  );
};
