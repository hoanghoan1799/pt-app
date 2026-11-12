import { addDays, toUtcDate } from "./date.js";

export const DAYS_PER_WEEK = 7;

// Every "today" in the app is a Vietnam calendar day.
export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export const getTodayDate = (
  timeZone: string = VIETNAM_TIME_ZONE,
  now = new Date(),
) =>
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
