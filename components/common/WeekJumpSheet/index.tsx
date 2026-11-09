"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { MonthGrid } from "@/components/common/MonthGrid";
import { BUTTON_SECONDARY } from "@/constants/styles";
import { getMonthOf, shiftMonth } from "@/utils/month";
import {
  addDays,
  buildScheduleHref,
  formatFullDay,
  formatWeekTitle,
  getWeekStart,
} from "@/utils/week";

interface WeekJumpSheetProps {
  basePath: string;
  weekStart: string;
  selectedDate: string;
  today: string;
  // The week title (and its icon) that opens the calendar.
  children: ReactNode;
}

// View-only month calendar: tapping a day jumps the page to that day's week.
export const WeekJumpSheet = ({
  basePath,
  weekStart,
  selectedDate,
  today,
  children,
}: WeekJumpSheetProps) => {
  const t = useTranslations("common.week");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState(getMonthOf(selectedDate));

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setMonth(getMonthOf(selectedDate));
    }
    setIsOpen(open);
  };

  const weekEnd = addDays(weekStart, 6);
  const tomorrow = addDays(today, 1);

  const jumpTo = (date: string) => {
    router.push(
      buildScheduleHref(basePath, {
        weekStart: getWeekStart(date),
        selectedDate: date,
      }),
      { scroll: false },
    );
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label={t("openCalendar", { week: formatWeekTitle(weekStart) })}
        className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-fg transition active:opacity-70"
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        title={t("calendarTitle")}
        description={t("calendarDescription")}
      >
        <MonthGrid
          month={month}
          onPreviousMonth={() => setMonth((value) => shiftMonth(value, -1))}
          onNextMonth={() => setMonth((value) => shiftMonth(value, 1))}
          renderDay={(date) => {
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const isInWeek = date >= weekStart && date <= weekEnd;
            const tag = isToday
              ? t("today")
              : date === tomorrow
                ? t("tomorrow")
                : "";

            return (
              <button
                type="button"
                aria-label={[
                  formatFullDay(date),
                  isToday && t("dayIsToday"),
                  isSelected && t("dayIsSelected"),
                ]
                  .filter(Boolean)
                  .join(", ")}
                aria-current={isSelected ? "date" : undefined}
                onClick={() => jumpTo(date)}
                className={clsx(
                  "flex min-h-13 min-w-0 flex-col items-center justify-center gap-px overflow-hidden rounded-xl border py-0.5 transition active:scale-[0.97]",
                  isSelected
                    ? "border-accent bg-accent text-accent-fg"
                    : isInWeek
                      ? "border-accent/30 bg-accent/15"
                      : "border-line bg-surface",
                  isToday &&
                    (isSelected
                      ? "border-2"
                      : "border-2 border-accent text-accent"),
                )}
              >
                <span className="text-[15px] font-bold">
                  {Number(date.slice(8, 10))}
                </span>
                <span className="h-2.5 text-[9px] leading-none font-medium tracking-tight whitespace-nowrap">
                  {tag}
                </span>
              </button>
            );
          }}
        />
        <div className="sticky bottom-0 -mx-4 -mb-[calc(env(safe-area-inset-bottom)+1.25rem)] mt-3 bg-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <button
            type="button"
            onClick={() => jumpTo(today)}
            disabled={selectedDate === today}
            className={`${BUTTON_SECONDARY} w-full`}
          >
            {t("backToToday")}
          </button>
        </div>
      </BottomSheet>
    </>
  );
};
