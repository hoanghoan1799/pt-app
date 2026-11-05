import clsx from "clsx";
import { Check } from "lucide-react";
import Link from "next/link";

import {
  buildScheduleHref,
  formatDayNumber,
  formatFullDay,
  getWeekdayShortLabel,
} from "@/utils/week";

export type WeekDayStatus = "complete" | "partial" | "none";

// Dot colour per status (green, yellow, grey); shared with the legend.
export const DAY_STATUS_DOT_CLASSES: Record<WeekDayStatus, string> = {
  complete: "bg-success",
  partial: "bg-warning",
  none: "bg-muted/50",
};

export interface WeekDayTabItem {
  date: string;
  // "dot": something is planned/logged, "check": the day is done.
  marker: "none" | "dot" | "check";
  // Appended to the day name for screen readers, e.g. ", 3 bài".
  description?: string;
  // Completion dot (green, yellow, grey); replaces `marker` when set.
  status?: WeekDayStatus;
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
}: WeekDayTabsProps) => (
  <div className="grid grid-cols-7 gap-1">
    {items.map((item) => {
      const isSelected = item.date === selectedDate;
      const isToday = item.date === today;

      return (
        <Link
          key={item.date}
          href={buildScheduleHref(basePath, {
            weekStart,
            selectedDate: item.date,
          })}
          scroll={false}
          aria-current={isSelected ? "date" : undefined}
          aria-label={`${formatFullDay(item.date)}${item.description ?? ""}`}
          className={clsx(
            "relative flex h-[68px] flex-col items-center justify-center rounded-2xl border transition active:scale-95",
            isSelected
              ? "border-accent bg-accent text-accent-fg shadow-md shadow-accent/25"
              : "border-line bg-surface text-fg",
            isToday && !isSelected && "border-accent/60 text-accent",
          )}
        >
          <span className="text-[11px] font-semibold opacity-75">
            {getWeekdayShortLabel(item.date)}
          </span>
          <span className="mt-0.5 text-lg leading-none font-bold">
            {formatDayNumber(item.date)}
          </span>
          {item.status && (
            <span
              data-testid="day-status"
              data-status={item.status}
              className={clsx(
                "absolute bottom-1.5 size-2 rounded-full",
                DAY_STATUS_DOT_CLASSES[item.status],
                isSelected && "ring-2 ring-accent-fg/70",
              )}
            />
          )}
          {!item.status && item.marker === "check" && (
            <Check
              className={clsx(
                "absolute bottom-1 size-3.5",
                isSelected ? "text-accent-fg" : "text-success",
              )}
              strokeWidth={3.5}
              aria-hidden
            />
          )}
          {!item.status && item.marker === "dot" && (
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
