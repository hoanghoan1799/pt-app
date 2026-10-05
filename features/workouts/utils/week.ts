import {
  DATE_PATTERN,
  DAYS_PER_WEEK,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT_LABELS,
} from "@/features/workouts/constants/week";

// Dates are plain "YYYY-MM-DD" strings; arithmetic runs in UTC so the result
// never depends on the server's time zone.
const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

export const isValidDate = (
  value: string | undefined | null,
): value is string => {
  if (!value || !DATE_PATTERN.test(value)) {
    return false;
  }
  const date = toUtcDate(value);

  return !Number.isNaN(date.getTime()) && toDateString(date) === value;
};

export const getTodayDate = (timeZone: string, now = new Date()) =>
  // en-CA formats as YYYY-MM-DD.
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);

export const addDays = (date: string, days: number) => {
  const result = toUtcDate(date);

  result.setUTCDate(result.getUTCDate() + days);
  return toDateString(result);
};

// Monday = 0 … Sunday = 6.
export const getWeekdayIndex = (date: string) =>
  (toUtcDate(date).getUTCDay() + 6) % 7;

export const getWeekStart = (date: string) =>
  addDays(date, -getWeekdayIndex(date));

export const getWeekDates = (weekStart: string) =>
  Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
    addDays(weekStart, index),
  );

export const formatDayMonth = (date: string) => {
  const [, month, day] = date.split("-");

  return `${day}/${month}`;
};

export const formatDayNumber = (date: string) => date.slice(8, 10);

export const formatWeekRange = (weekStart: string) =>
  `${formatDayMonth(weekStart)} – ${formatDayMonth(addDays(weekStart, DAYS_PER_WEEK - 1))}`;

export const getWeekdayLabel = (date: string) =>
  WEEKDAY_LABELS[getWeekdayIndex(date)];

export const getWeekdayShortLabel = (date: string) =>
  WEEKDAY_SHORT_LABELS[getWeekdayIndex(date)];

export const formatFullDay = (date: string) =>
  `${getWeekdayLabel(date)}, ${formatDayMonth(date)}`;

interface ScheduleParams {
  week?: string;
  day?: string;
}

// Picks the week and selected day from URL params: any date in `week` snaps to
// its Monday, and the selected day falls back to today (if in that week) or
// the Monday.
export const resolveSchedule = (
  { week, day }: ScheduleParams,
  today: string,
) => {
  const weekStart = getWeekStart(
    isValidDate(week) ? week : isValidDate(day) ? day : today,
  );
  const weekDates = getWeekDates(weekStart);

  if (isValidDate(day) && weekDates.includes(day)) {
    return { weekStart, selectedDate: day };
  }
  return {
    weekStart,
    selectedDate: weekDates.includes(today) ? today : weekStart,
  };
};

// Moving to another week keeps the same weekday selected.
export const shiftSchedule = (selectedDate: string, weeks: number) => {
  const date = addDays(selectedDate, weeks * DAYS_PER_WEEK);

  return { weekStart: getWeekStart(date), selectedDate: date };
};

export const getRelativeWeekLabel = (weekStart: string, today: string) => {
  const diffWeeks = Math.round(
    (toUtcDate(weekStart).getTime() -
      toUtcDate(getWeekStart(today)).getTime()) /
      (DAYS_PER_WEEK * 24 * 60 * 60 * 1000),
  );

  if (diffWeeks === 0) {
    return "Tuần này";
  }
  if (diffWeeks === 1) {
    return "Tuần sau";
  }
  if (diffWeeks === -1) {
    return "Tuần trước";
  }
  return diffWeeks > 0 ? `${diffWeeks} tuần nữa` : `${-diffWeeks} tuần trước`;
};

interface ScheduleLocation {
  weekStart: string;
  selectedDate: string;
}

export const buildScheduleHref = (
  basePath: string,
  { weekStart, selectedDate }: ScheduleLocation,
) =>
  `${basePath}?${new URLSearchParams({ week: weekStart, day: selectedDate })}`;
