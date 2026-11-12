import { REVEAL_WINDOW_SECONDS, UNLOCK_WINDOW_SECONDS } from "@pt/contracts";

// Pure session rules: no database, no clock of their own.

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubjectKind = "user" | "admin";

export type SessionPolicy = {
  ttlMs: number;
  // Whether using the session pushes expiry forward.
  slides: boolean;
};

// Users: 400 days (the longest a browser cookie lived), sliding, as the web
// proxy's refresh did. Admins: 7 days from sign-in, never extended by use
// (the web admin JWT was a fixed 7 days). Only `refresh` renews an admin.
export const SESSION_POLICIES: Record<SubjectKind, SessionPolicy> = {
  user: { ttlMs: 400 * DAY_MS, slides: true },
  admin: { ttlMs: 7 * DAY_MS, slides: false },
};

// Expiry is extended only when the last use is older than this.
export const SLIDE_AFTER_MS = DAY_MS;
// last_seen_at is written at most this often.
export const TOUCH_AFTER_MS = 60 * 1000;

export const expiryFor = (kind: SubjectKind, now: Date) =>
  new Date(now.getTime() + SESSION_POLICIES[kind].ttlMs);

export const isExpired = (expiresAt: Date, now: Date) =>
  expiresAt.getTime() <= now.getTime();

export type SlidePatch = { lastSeenAt?: Date; expiresAt?: Date };

// What to write after a request authenticated with this session, or null when
// nothing is due.
export const computeSlide = (
  session: { subjectKind: SubjectKind; lastSeenAt: Date },
  now: Date,
): SlidePatch | null => {
  const idle = now.getTime() - session.lastSeenAt.getTime();
  const patch: SlidePatch = {};

  if (idle >= TOUCH_AFTER_MS) {
    patch.lastSeenAt = now;
  }
  if (SESSION_POLICIES[session.subjectKind].slides && idle >= SLIDE_AFTER_MS) {
    patch.expiresAt = expiryFor(session.subjectKind, now);
  }
  return Object.keys(patch).length > 0 ? patch : null;
};

// Locked = the admin has a passcode and no valid unlock on this session.
// No passcode = never locked.
export const isLockedFor = (
  hasPasscode: boolean,
  unlockedUntil: Date | null,
  now: Date,
) => hasPasscode && !(unlockedUntil && unlockedUntil.getTime() > now.getTime());

// Hidden trainees are visible only inside a reveal window the admin earned
// on this session.
export const isRevealActive = (revealedUntil: Date | null, now: Date) =>
  Boolean(revealedUntil && revealedUntil.getTime() > now.getTime());

export const unlockExpiry = (now: Date) =>
  new Date(now.getTime() + UNLOCK_WINDOW_SECONDS * 1000);

export const revealExpiry = (now: Date) =>
  new Date(now.getTime() + REVEAL_WINDOW_SECONDS * 1000);
