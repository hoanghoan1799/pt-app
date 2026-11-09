import { DATE_PATTERN, DAYS_PER_WEEK } from "@/constants/week";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale, toIntlLocale } from "@/utils/locale";

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

// "Nov" in English; Vietnamese names months by number, so it is "11".
export const formatMonthName = (
  month: number,
  locale: Locale = DEFAULT_LOCALE,
  width: "short" | "long" = "short",
) =>
  locale === "vi"
    ? String(month)
    : new Intl.DateTimeFormat(toIntlLocale(locale), {
        month: width,
        timeZone: "UTC",
      }).format(Date.UTC(2000, month - 1, 1));

// "02/11" in Vietnamese, "Nov 2" in English.
export const formatDayMonth = (
  date: string,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const [, month, day] = date.split("-");

  return locale === "vi"
    ? `${day}/${month}`
    : `${formatMonthName(Number(month), locale)} ${Number(day)}`;
};

export const formatDayNumber = (date: string) =>
  String(Number(date.slice(8, 10)));

export const formatWeekRange = (
  weekStart: string,
  locale: Locale = DEFAULT_LOCALE,
) =>
  `${formatDayMonth(weekStart, locale)} – ${formatDayMonth(addDays(weekStart, DAYS_PER_WEEK - 1), locale)}`;

// "2/11" in Vietnamese, "Nov 2" in English.
const formatDayMonthShort = (date: string, locale: Locale) => {
  const [, month, day] = date.split("-");

  return locale === "vi"
    ? `${Number(day)}/${Number(month)}`
    : `${formatMonthName(Number(month), locale)} ${Number(day)}`;
};

// "Tuần 2–8/11, 2026"; a week spanning two months or years names both.
// English: "Nov 2–8, 2026", "Oct 26 – Nov 1, 2026".
export const formatWeekTitle = (
  weekStart: string,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const t = getFormatTranslator(locale);
  const weekEnd = addDays(weekStart, DAYS_PER_WEEK - 1);
  const startYear = weekStart.slice(0, 4);
  const endYear = weekEnd.slice(0, 4);

  if (startYear !== endYear) {
    return t("weekTitle.crossYear", {
      start: formatDayMonthShort(weekStart, locale),
      end: formatDayMonthShort(weekEnd, locale),
      startYear,
      endYear,
    });
  }
  if (weekStart.slice(5, 7) !== weekEnd.slice(5, 7)) {
    return t("weekTitle.crossMonth", {
      start: formatDayMonthShort(weekStart, locale),
      end: formatDayMonthShort(weekEnd, locale),
      year: endYear,
    });
  }
  return t("weekTitle.sameMonth", {
    startDay: Number(weekStart.slice(8, 10)),
    endDay: Number(weekEnd.slice(8, 10)),
    month: formatMonthName(Number(weekEnd.slice(5, 7)), locale),
    year: endYear,
  });
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const getWeekdayLabel = (
  date: string,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)(
    `weekdayLong.${WEEKDAY_KEYS[getWeekdayIndex(date)]}`,
  );

// Monday … Sunday, for a calendar's header row.
export const getWeekdayShortLabels = (locale: Locale = DEFAULT_LOCALE) =>
  WEEKDAY_KEYS.map((key) => getFormatTranslator(locale)(`weekdayShort.${key}`));

export const getWeekdayShortLabel = (
  date: string,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)(
    `weekdayShort.${WEEKDAY_KEYS[getWeekdayIndex(date)]}`,
  );

// "Thứ Hai, 02/11" / "Monday, Nov 2".
export const formatFullDay = (date: string, locale: Locale = DEFAULT_LOCALE) =>
  getFormatTranslator(locale)("fullDay", {
    weekday: getWeekdayLabel(date, locale),
    date: formatDayMonth(date, locale),
  });

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

interface ScheduleLocation {
  weekStart: string;
  selectedDate: string;
}

export const buildScheduleHref = (
  basePath: string,
  { weekStart, selectedDate }: ScheduleLocation,
) =>
  `${basePath}?${new URLSearchParams({ week: weekStart, day: selectedDate })}`;
