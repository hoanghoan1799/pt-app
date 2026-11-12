import { describe, expect, it } from "vitest";

import {
  computeSlide,
  expiryFor,
  isExpired,
  isLockedFor,
  isRevealActive,
  revealExpiry,
  SESSION_POLICIES,
  SLIDE_AFTER_MS,
  TOUCH_AFTER_MS,
  unlockExpiry,
} from "./session-rules.js";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-12T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const ahead = (ms: number) => new Date(now.getTime() + ms);

describe("expiry", () => {
  it("is 400 days for a trainee and 7 days for an admin", () => {
    expect(expiryFor("user", now).getTime() - now.getTime()).toBe(400 * DAY);
    expect(expiryFor("admin", now).getTime() - now.getTime()).toBe(7 * DAY);
  });

  it("expires exactly at expires_at", () => {
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(ahead(1), now)).toBe(false);
    expect(isExpired(ago(1), now)).toBe(true);
  });
});

describe("computeSlide", () => {
  it("does nothing when the last use is recent", () => {
    expect(
      computeSlide({ subjectKind: "user", lastSeenAt: ago(1000) }, now),
    ).toBeNull();
    expect(
      computeSlide(
        { subjectKind: "user", lastSeenAt: ago(TOUCH_AFTER_MS - 1) },
        now,
      ),
    ).toBeNull();
  });

  it("touches last_seen_at after a minute without moving the expiry", () => {
    expect(
      computeSlide(
        { subjectKind: "user", lastSeenAt: ago(TOUCH_AFTER_MS) },
        now,
      ),
    ).toEqual({ lastSeenAt: now });
  });

  it("extends a trainee's expiry once the last use is a day old", () => {
    expect(
      computeSlide(
        { subjectKind: "user", lastSeenAt: ago(SLIDE_AFTER_MS - 1) },
        now,
      ),
    ).toEqual({ lastSeenAt: now });
    expect(
      computeSlide(
        { subjectKind: "user", lastSeenAt: ago(SLIDE_AFTER_MS) },
        now,
      ),
    ).toEqual({ lastSeenAt: now, expiresAt: expiryFor("user", now) });
  });

  it("never extends an admin session by use", () => {
    expect(SESSION_POLICIES.admin.slides).toBe(false);
    expect(
      computeSlide({ subjectKind: "admin", lastSeenAt: ago(5 * DAY) }, now),
    ).toEqual({ lastSeenAt: now });
  });
});

describe("passcode lock", () => {
  it("never locks an admin without a passcode", () => {
    expect(isLockedFor(false, null, now)).toBe(false);
    expect(isLockedFor(false, ago(1), now)).toBe(false);
  });

  it("locks an admin with a passcode unless the unlock is still valid", () => {
    expect(isLockedFor(true, null, now)).toBe(true);
    expect(isLockedFor(true, ago(1), now)).toBe(true);
    expect(isLockedFor(true, now, now)).toBe(true);
    expect(isLockedFor(true, ahead(1), now)).toBe(false);
  });

  it("unlocks for 5 minutes and reveals for 10", () => {
    expect(unlockExpiry(now).getTime() - now.getTime()).toBe(5 * 60 * 1000);
    expect(revealExpiry(now).getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });

  it("reveal is active only before its end", () => {
    expect(isRevealActive(null, now)).toBe(false);
    expect(isRevealActive(ago(1), now)).toBe(false);
    expect(isRevealActive(now, now)).toBe(false);
    expect(isRevealActive(ahead(1), now)).toBe(true);
  });
});
