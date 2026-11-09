import clsx from "clsx";
import Link from "next/link";
import { useLocale } from "next-intl";

import {
  buildScheduleHref,
  formatDayNumber,
  formatFullDay,
  getWeekdayShortLabel,
} from "@/utils/week";

export type WeekDayStatus = "complete" | "partial" | "none";

// Dot colour per status (green, orange); "none" keeps the space but shows no
// dot. Shared with the legend.
export const DAY_STATUS_DOT_CLASSES: Record<WeekDayStatus, string> = {
  complete: "bg-success",
  partial: "bg-warning",
  none: "bg-transparent",
};

export interface WeekDayTabItem {
  date: string;
  // Appended to the day name for screen readers, e.g. ", 3 bài".
  description?: string;
  status: WeekDayStatus;
}

interface WeekDayTabsProps {
  basePath: string;
  weekStart: string;
  items: WeekDayTabItem[];
  selectedDate: string;
  today: string;
}

export const WeekDayTabs = ({
  basePath,
  weekStart,
  items,
  selectedDate,
  today,
}: WeekDayTabsProps) => {
  const locale = useLocale();

  return (
    <div className="grid grid-cols-7 gap-1.5 px-0.5">
      {items.map((item) => {
        const isSelected = item.date === selectedDate;
        const isFuture = item.date > today;

        return (
          <Link
            key={item.date}
            href={buildScheduleHref(basePath, {
              weekStart,
              selectedDate: item.date,
            })}
            scroll={false}
            aria-current={isSelected ? "date" : undefined}
            aria-label={`${formatFullDay(item.date, locale)}${item.description ?? ""}`}
            data-future={isFuture ? "true" : undefined}
            className={clsx(
              "flex min-w-0 flex-col items-center rounded-xl border py-2 transition active:scale-95",
              isSelected &&
                "border-accent bg-accent text-accent-fg ring-2 ring-accent ring-offset-2 ring-offset-surface",
              !isSelected &&
                isFuture &&
                "border-transparent bg-line/50 text-muted",
              !isSelected && !isFuture && "border-line bg-surface text-fg",
            )}
          >
            <span className="text-[11px] font-semibold opacity-75">
              {getWeekdayShortLabel(item.date, locale)}
            </span>
            <span className="mt-1 text-lg leading-none font-bold">
              {formatDayNumber(item.date)}
            </span>
            <span
              data-testid="day-status"
              data-status={item.status}
              className={clsx(
                "mt-1.5 size-1.5 rounded-full",
                DAY_STATUS_DOT_CLASSES[item.status],
                isSelected &&
                  item.status !== "none" &&
                  "ring-1 ring-accent-fg/70",
              )}
            />
          </Link>
        );
      })}
    </div>
  );
};
