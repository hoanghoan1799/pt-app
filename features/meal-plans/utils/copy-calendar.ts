import { addDays, getWeekdayIndex, isValidDate } from "@/utils/week";

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

export const getMonthOf = (date: string) => date.slice(0, 7);

// The month `delta` months from `month` ("YYYY-MM").
export const shiftMonth = (month: string, delta: number) => {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

export const getMonthStart = (month: string) => `${month}-01`;

export const getMonthEnd = (month: string) =>
  addDays(getMonthStart(shiftMonth(month, 1)), -1);

// "Tháng 11, 2026"
export const formatMonthLabel = (month: string) => {
  const [year, number] = month.split("-");

  return `Tháng ${Number(number)}, ${year}`;
};

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
  const first = getMonthStart(month);

  if (!isValidDate(first)) {
    return [];
  }

  const tomorrow = addDays(today, 1);
  const length = Number(getMonthEnd(month).slice(8, 10));
  const blanks = Array.from<null>({ length: getWeekdayIndex(first) }).fill(
    null,
  );
  const days = Array.from({ length }, (_, index): CopyCalendarDay => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const isPast = date < today;
    const isSource = date === sourceDate;

    return {
      date,
      day: index + 1,
      isPast,
      isToday: date === today,
      isTomorrow: date === tomorrow,
      isSource,
      hasPlan: datesWithPlan.includes(date),
      isDisabled: isPast || isSource,
    };
  });

  return [...blanks, ...days];
};
