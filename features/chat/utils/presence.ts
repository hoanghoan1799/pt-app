import { TIME_ZONE } from "@/constants/time";

// Online = a heartbeat landed in the last two minutes. The client beats every
// minute while the app is visible, so one missed beat still reads as online.
export const PRESENCE_ONLINE_MS = 120_000;
export const PRESENCE_HEARTBEAT_MS = 60_000;

export const ONLINE_LABEL = "Đang hoạt động";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const isOnline = (lastSeenAt: Date | null, now: Date): boolean =>
  lastSeenAt !== null &&
  now.getTime() - lastSeenAt.getTime() < PRESENCE_ONLINE_MS;

const dateParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return { year: get("year"), month: get("month"), day: get("day") };
};

const dayKey = (date: Date, timeZone: string) => {
  const { year, month, day } = dateParts(date, timeZone);

  return `${year}-${month}-${day}`;
};

// Relative "last seen" text. Never shows an exact time: minutes, hours,
// "hôm qua", then the date. Null when the person was never seen (the UI hides
// the line). A last-seen in the future (clock skew) counts as online.
export const formatLastSeen = (
  lastSeenAt: Date | null,
  now: Date,
  timeZone: string = TIME_ZONE,
): string | null => {
  if (lastSeenAt === null) {
    return null;
  }
  const elapsed = now.getTime() - lastSeenAt.getTime();

  if (elapsed < PRESENCE_ONLINE_MS) {
    return ONLINE_LABEL;
  }
  const today = dayKey(now, timeZone);
  const seenDay = dayKey(lastSeenAt, timeZone);

  if (seenDay === today) {
    return elapsed < HOUR_MS
      ? `Hoạt động ${Math.floor(elapsed / MINUTE_MS)} phút trước`
      : `Hoạt động ${Math.floor(elapsed / HOUR_MS)} giờ trước`;
  }
  if (seenDay === dayKey(new Date(now.getTime() - DAY_MS), timeZone)) {
    return "Hoạt động hôm qua";
  }
  const { year, month, day } = dateParts(lastSeenAt, timeZone);

  return year === dateParts(now, timeZone).year
    ? `Hoạt động ${day}/${month}`
    : `Hoạt động ${day}/${month}/${year}`;
};

// Trainee side: the PT team is online when ANY admin is, otherwise the most
// recent last-seen wins (shared inbox).
export const latestSeen = (values: (Date | null)[]): Date | null =>
  values.reduce<Date | null>(
    (latest, value) =>
      value !== null && (latest === null || value > latest) ? value : latest,
    null,
  );

export const serializeLastSeen = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

export const parseLastSeen = (
  value: string | null | undefined,
): Date | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};
