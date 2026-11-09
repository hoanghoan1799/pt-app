import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { WeekJumpSheet } from "@/components/common/WeekJumpSheet";
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
  const t = useTranslations("common.week");
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
      aria-label={t("select")}
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"
    >
      <WeekJumpSheet
        basePath={basePath}
        weekStart={weekStart}
        selectedDate={selectedDate}
        today={today}
      >
        <CalendarDays className="size-5 shrink-0 text-accent" aria-hidden />
        {formatWeekTitle(weekStart)}
      </WeekJumpSheet>
      <div className="flex items-center">
        <Link
          href={previousHref}
          scroll={false}
          className={clsx(CONTROL, "w-8")}
          aria-label={t("previous")}
        >
          <ChevronLeft className="size-5" />
        </Link>
        {isOnToday ? (
          <span
            aria-disabled="true"
            className="inline-flex h-9 items-center px-1.5 text-sm font-semibold text-muted"
          >
            {t("today")}
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
            {t("today")}
          </Link>
        )}
        <Link
          href={nextHref}
          scroll={false}
          className={clsx(CONTROL, "w-8")}
          aria-label={t("next")}
        >
          <ChevronRight className="size-5" />
        </Link>
      </div>
    </nav>
  );
};
