import { addDays, toUtcDate } from "@pt/contracts";

// Pure date helpers ported from apps/web/utils/week.ts. Dates are plain
// "YYYY-MM-DD" strings; weeks start on Monday.

export const DAYS_PER_WEEK = 7;

export const getTodayDate = (timeZone: string, now: Date) =>
  // en-CA formats as YYYY-MM-DD.
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);

// Monday = 0 ... Sunday = 6.
export const getWeekdayIndex = (date: string) =>
  (toUtcDate(date).getUTCDay() + 6) % 7;

export const getWeekStart = (date: string) =>
  addDays(date, -getWeekdayIndex(date));

export const getWeekDates = (weekStart: string) =>
  Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
    addDays(weekStart, index),
  );

// Every date from `from` to `to`, both included.
export const eachDate = (from: string, to: string) => {
  const dates: string[] = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
};
