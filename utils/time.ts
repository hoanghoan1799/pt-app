import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale, toIntlLocale } from "@/utils/locale";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// "18:30" in the given time zone.
export const formatClockTime = (
  timestamp: number,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
) =>
  new Intl.DateTimeFormat(toIntlLocale(locale), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);

// "05/10" in the given time zone ("Oct 5" in English). Built from parts
// because the vi-VN day/month separator differs between ICU versions
// ("05/10" vs "05-10").
export const formatShortDate = (
  timestamp: number,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
) => {
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
    }).format(timestamp);
  }
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(timestamp);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("day")}/${getPart("month")}`;
};

// "05/10 18:30" in the given time zone.
export const formatShortDateTime = (
  timestamp: number,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
) =>
  `${formatShortDate(timestamp, timeZone, locale)} ${formatClockTime(timestamp, timeZone, locale)}`;

// "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước", then "05/10".
// English: "just now", "5 minutes ago", ..., "Oct 5".
export const formatRelativeTime = (
  timestamp: number,
  timeZone: string,
  now = Date.now(),
  locale: Locale = DEFAULT_LOCALE,
) => {
  const t = getFormatTranslator(locale);
  const elapsed = Math.max(0, now - timestamp);

  if (elapsed < MINUTE_MS) {
    return t("relative.justNow");
  }
  if (elapsed < HOUR_MS) {
    return t("relative.minutes", { count: Math.floor(elapsed / MINUTE_MS) });
  }
  if (elapsed < DAY_MS) {
    return t("relative.hours", { count: Math.floor(elapsed / HOUR_MS) });
  }
  if (elapsed < 7 * DAY_MS) {
    return t("relative.days", { count: Math.floor(elapsed / DAY_MS) });
  }
  return formatShortDate(timestamp, timeZone, locale);
};

export const calculatePercent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

// Request timestamp for server components, which render once per request, so
// relative times ("5 phút trước") are computed against a single "now".
export const getRequestTime = () => Date.now();
