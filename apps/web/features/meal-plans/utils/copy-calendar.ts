import { addDays } from "@pt/contracts";

import {
  buildMonthCells,
  formatMonthLabel,
  getMonthEnd,
  getMonthOf,
  getMonthStart,
  shiftMonth,
} from "@/utils/month";

// The month helpers live in `@/utils/month`; re-exported for existing imports.
export { formatMonthLabel, getMonthEnd, getMonthOf, getMonthStart, shiftMonth };

export interface CopyCalendarDay {
  date: string;
  // Day of the month, 1 to 31.
  day: number;
  isPast: boolean;
  isToday: boolean;
  isTomorrow: boolean;
  isSource: boolean;
  hasPlan: boolean;
  // Past days and the source day cannot be picked.
  isDisabled: boolean;
}

interface BuildCopyMonthOptions {
  // "YYYY-MM"
  month: string;
  today: string;
  sourceDate: string;
  datesWithPlan: string[];
}

// The first month that can be shown is the one holding today.
export const canGoToPreviousMonth = (month: string, today: string) =>
  month > getMonthOf(today);

// A Monday-first month grid: `null` cells pad the first week so the 1st lands
// under its weekday; the last week is left short.
export const buildCopyMonth = ({
  month,
  today,
  sourceDate,
  datesWithPlan,
}: BuildCopyMonthOptions): (CopyCalendarDay | null)[] => {
  const tomorrow = addDays(today, 1);

  return buildMonthCells(month).map((date): CopyCalendarDay | null => {
    if (!date) {
      return null;
    }

    const isPast = date < today;
    const isSource = date === sourceDate;

    return {
      date,
      day: Number(date.slice(8, 10)),
      isPast,
      isToday: date === today,
      isTomorrow: date === tomorrow,
      isSource,
      hasPlan: datesWithPlan.includes(date),
      isDisabled: isPast || isSource,
    };
  });
};

export interface MonthInfo {
  planDates: string[];
  logDates: string[];
}

// A month read from the server wins over the page's data for its dates. A
// month whose read failed (`null`) keeps the page's data, so a known plan is
// never hidden and its overwrite confirm still shows.
export const mergeMonthDates = (
  pageDates: string[],
  loaded: Record<string, MonthInfo | null>,
  key: keyof MonthInfo,
): string[] => {
  const fromPage = pageDates.filter((date) => !loaded[getMonthOf(date)]);
  const fromServer = Object.values(loaded).flatMap((info) =>
    info ? info[key] : [],
  );

  return [...fromPage, ...fromServer];
};
