import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { ICON_BUTTON } from "@/constants/styles";
import {
  buildScheduleHref,
  formatWeekRange,
  getRelativeWeekLabel,
  getWeekStart,
  shiftSchedule,
} from "@/utils/week";

interface WeekNavigatorProps {
  basePath: string;
  weekStart: string;
  selectedDate: string;
  today: string;
}

export const WeekNavigator = ({
  basePath,
  weekStart,
  selectedDate,
  today,
}: WeekNavigatorProps) => {
  const isCurrentWeek = weekStart === getWeekStart(today);
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
      className="flex items-center justify-between gap-2"
    >
      <Link
        href={previousHref}
        scroll={false}
        className={ICON_BUTTON}
        aria-label="Tuần trước"
      >
        <ChevronLeft className="size-6" />
      </Link>
      <div className="flex min-w-0 flex-col items-center text-center">
        <p className="font-bold text-fg">
          {getRelativeWeekLabel(weekStart, today)}
        </p>
        <p className="text-sm text-muted">
          {formatWeekRange(weekStart)}
          {!isCurrentWeek && (
            <>
              {" · "}
              <Link
                href={todayHref}
                scroll={false}
                className="font-semibold text-accent"
              >
                Hôm nay
              </Link>
            </>
          )}
        </p>
      </div>
      <Link
        href={nextHref}
        scroll={false}
        className={ICON_BUTTON}
        aria-label="Tuần sau"
      >
        <ChevronRight className="size-6" />
      </Link>
    </nav>
  );
};
