"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { ICON_BUTTON } from "@/constants/styles";
import { WEEKDAY_SHORT_LABELS } from "@/constants/week";
import { buildMonthCells, formatMonthLabel } from "@/utils/month";

interface MonthGridProps {
  // "YYYY-MM"
  month: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  canGoBack?: boolean;
  // The cell of one "YYYY-MM-DD" date.
  renderDay: (date: string) => ReactNode;
}

// A month header with previous / next buttons, the weekday row and a
// Monday-first grid. The cells are drawn by the caller.
export const MonthGrid = ({
  month,
  onPreviousMonth,
  onNextMonth,
  canGoBack = true,
  renderDay,
}: MonthGridProps) => (
  <div>
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPreviousMonth}
        disabled={!canGoBack}
        aria-label="Tháng trước"
        className={ICON_BUTTON}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <p aria-live="polite" className="font-bold text-fg">
        {formatMonthLabel(month)}
      </p>
      <button
        type="button"
        onClick={onNextMonth}
        aria-label="Tháng sau"
        className={ICON_BUTTON}
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
    <div className="mt-1 grid grid-cols-7 gap-1">
      {WEEKDAY_SHORT_LABELS.map((label) => (
        <div
          key={label}
          aria-hidden
          className="py-1 text-center text-xs font-semibold text-muted"
        >
          {label}
        </div>
      ))}
      {buildMonthCells(month).map((date, index) =>
        date ? (
          <Fragment key={date}>{renderDay(date)}</Fragment>
        ) : (
          <span key={`blank-${index}`} />
        ),
      )}
    </div>
  </div>
);
