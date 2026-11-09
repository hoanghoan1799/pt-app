import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";
import { formatDayMonth, getWeekdayShortLabel } from "@/utils/week";

// The chosen dates that already have a plan, in date order.
export const getOverwriteDates = (
  selected: string[],
  datesWithPlan: string[],
) => selected.filter((date) => datesWithPlan.includes(date)).sort();

const formatDates = (dates: string[], locale: Locale) =>
  dates
    .map(
      (date) =>
        `${getWeekdayShortLabel(date, locale)} ${formatDayMonth(date, locale)}`,
    )
    .join(", ");

// "Ghi đè plan của T3 27/10, T5 29/10?"
export const formatOverwriteQuestion = (
  dates: string[],
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)("overwrite.question", {
    dates: formatDates(dates, locale),
  });

// Overwriting a day also deletes what the trainee logged on it (KAN-71):
// "Học viên đã ghi bữa ăn ở T3 27/10; ghi đè sẽ xóa nhật ký đó." Null when
// none of the days to overwrite has logs or marks.
export const formatOverwriteLogWarning = (
  overwriteDates: string[],
  datesWithLogs: string[],
  locale: Locale = DEFAULT_LOCALE,
) => {
  const logged = overwriteDates.filter((date) => datesWithLogs.includes(date));

  return logged.length
    ? getFormatTranslator(locale)("overwrite.logWarning", {
        dates: formatDates(logged, locale),
      })
    : null;
};

export const formatDeletePlanQuestion = (
  hasLogs: boolean,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)(
    hasLogs ? "overwrite.deleteWithLogs" : "overwrite.delete",
  );
