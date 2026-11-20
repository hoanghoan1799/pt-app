import { VIETNAM_TIME_ZONE } from "../week.js";
import {
  RESTRICTION_DURATION_MS,
  type RESTRICTION_DURATIONS,
  type RESTRICTION_LEVELS,
} from "./constants.js";

export type RestrictionLevel = (typeof RESTRICTION_LEVELS)[number];

export type RestrictionDuration = (typeof RESTRICTION_DURATIONS)[number];

// The fields the rules need; the table row has more.
export interface RestrictionLike {
  level: RestrictionLevel;
  until: Date | null;
  liftedAt: Date | null;
}

// D6: active while it has not been lifted and has not run out. Computed on
// every read, so an expired restriction simply stops counting (no cron). The
// API's SQL uses the same rule (restrictions/restriction.sql.ts).
export const isRestrictionActive = (
  restriction: Pick<RestrictionLike, "until" | "liftedAt">,
  now: Date = new Date(),
) =>
  restriction.liftedAt === null &&
  (restriction.until === null || restriction.until.getTime() > now.getTime());

// The end of a block started at `now`; null for a permanent one.
export const computeRestrictionUntil = (
  duration: RestrictionDuration,
  now: Date = new Date(),
): Date | null =>
  duration === "permanent"
    ? null
    : new Date(now.getTime() + RESTRICTION_DURATION_MS[duration]);

// Of several rows (there should be one active), the one that applies:
// a suspension beats a restriction, then the newest wins.
export const pickActiveRestriction = <
  T extends RestrictionLike & { createdAt: Date },
>(
  rows: T[],
  now: Date = new Date(),
): T | null => {
  const active = rows.filter((row) => isRestrictionActive(row, now));

  return (
    active.sort(
      (a, b) =>
        Number(b.level === "suspended") - Number(a.level === "suspended") ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )[0] ?? null
  );
};

export const isSuspendedRestriction = (restriction: {
  level: RestrictionLevel;
}) => restriction.level === "suspended";

// "21/11/2026 17:00" in Vietnam time: the end of a suspension in the API's
// Vietnamese login message. The web renders its own locale from `details`.
export const formatRestrictionEndVi = (until: Date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: VIETNAM_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(until)
      .map((part) => [part.type, part.value]),
  );

  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
};

// D4: the login refusal of a suspended trainee, with the end (or permanent)
// and the reason the super admin wrote. Same text as company's
// errors.json toasts.suspendedUntil / suspendedForever (vi).
export const describeSuspensionVi = (restriction: {
  until: Date | null;
  reason: string;
}) =>
  restriction.until === null
    ? `Tài khoản của bạn đã bị khoá vĩnh viễn. Lý do: ${restriction.reason}`
    : `Tài khoản của bạn đã bị khoá đến ${formatRestrictionEndVi(restriction.until)}. Lý do: ${restriction.reason}`;
