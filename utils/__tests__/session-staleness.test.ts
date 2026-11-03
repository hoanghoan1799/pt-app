import { describe, expect, it } from "vitest";

import {
  isSessionStale,
  refreshedUserPayload,
  sessionAuthTime,
} from "@/utils/session-staleness";

const CHANGED = new Date(1_700_000_000_000);

describe("isSessionStale", () => {
  it("rejects a session issued before the password change", () => {
    expect(isSessionStale(1_699_999_999, CHANGED)).toBe(true);
  });

  it("accepts a session issued in the same second", () => {
    expect(isSessionStale(1_700_000_000, CHANGED)).toBe(false);
  });

  it("accepts a session issued after the change", () => {
    expect(isSessionStale(1_700_000_100, CHANGED)).toBe(false);
  });

  it("accepts any session when the password never changed", () => {
    expect(isSessionStale(1, null)).toBe(false);
  });
});

describe("sessionAuthTime", () => {
  it("uses authAt when the token has it", () => {
    expect(
      sessionAuthTime({
        role: "user",
        userId: 1,
        authAt: 1_699_000_000,
        issuedAt: 1_700_100_000,
      }),
    ).toBe(1_699_000_000);
  });

  it("falls back to iat for tokens without authAt", () => {
    expect(
      sessionAuthTime({ role: "user", userId: 1, issuedAt: 1_699_500_000 }),
    ).toBe(1_699_500_000);
  });
});

describe("refreshedUserPayload", () => {
  it("keeps the original authAt so a later reset still makes it stale", () => {
    const payload = refreshedUserPayload({
      role: "user",
      userId: 7,
      authAt: 1_699_999_000,
      issuedAt: 1_699_999_500,
    });

    expect(payload).toEqual({ role: "user", userId: 7, authAt: 1_699_999_000 });
    expect(isSessionStale(payload.authAt, CHANGED)).toBe(true);
  });

  it("pins a legacy token's iat as authAt", () => {
    expect(
      refreshedUserPayload({ role: "user", userId: 7, issuedAt: 1_699_000_000 })
        .authAt,
    ).toBe(1_699_000_000);
  });
});
