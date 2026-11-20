import {
  blockUserRequestSchema,
  blockUserSchema,
  computeRestrictionUntil,
  describeSuspensionVi,
  formatRestrictionEndVi,
  isRestrictionActive,
  isSuspendedRestriction,
  pickActiveRestriction,
  RESTRICTION_MESSAGES,
} from "../restrictions/index.js";
import { describe, expect, it } from "vitest";

// Port of company features/restrictions/utils/__tests__/restriction-rules.test.ts.

const NOW = new Date("2026-11-14T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("isRestrictionActive", () => {
  it("is active while not lifted and the end is in the future", () => {
    expect(
      isRestrictionActive(
        { until: new Date(NOW.getTime() + HOUR), liftedAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("is active forever without an end date", () => {
    expect(isRestrictionActive({ until: null, liftedAt: null }, NOW)).toBe(
      true,
    );
  });

  it("stops at the end date, including the exact moment", () => {
    expect(
      isRestrictionActive(
        { until: new Date(NOW.getTime() - 1), liftedAt: null },
        NOW,
      ),
    ).toBe(false);
    expect(
      isRestrictionActive({ until: new Date(NOW), liftedAt: null }, NOW),
    ).toBe(false);
  });

  it("is not active once lifted, even with time left or permanent", () => {
    expect(
      isRestrictionActive(
        { until: new Date(NOW.getTime() + HOUR), liftedAt: NOW },
        NOW,
      ),
    ).toBe(false);
    expect(isRestrictionActive({ until: null, liftedAt: NOW }, NOW)).toBe(
      false,
    );
  });
});

describe("computeRestrictionUntil", () => {
  it("adds the duration to now", () => {
    expect(computeRestrictionUntil("24h", NOW)?.toISOString()).toBe(
      "2026-11-15T10:00:00.000Z",
    );
    expect(computeRestrictionUntil("7d", NOW)?.toISOString()).toBe(
      "2026-11-21T10:00:00.000Z",
    );
    expect(computeRestrictionUntil("30d", NOW)?.toISOString()).toBe(
      "2026-12-14T10:00:00.000Z",
    );
  });

  it("returns null for a permanent block", () => {
    expect(computeRestrictionUntil("permanent", NOW)).toBeNull();
  });
});

describe("pickActiveRestriction", () => {
  const row = (
    level: "restricted" | "suspended",
    createdAtMs: number,
    overrides: { until?: Date | null; liftedAt?: Date | null } = {},
  ) => ({
    level,
    createdAt: new Date(createdAtMs),
    until: null,
    liftedAt: null,
    ...overrides,
  });

  it("returns null when nothing is active", () => {
    expect(
      pickActiveRestriction(
        [
          row("suspended", 1, { liftedAt: NOW }),
          row("restricted", 2, { until: new Date(1) }),
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("prefers a suspension, then the newest", () => {
    const restricted = row("restricted", 9);
    const suspended = row("suspended", 1);

    expect(pickActiveRestriction([restricted, suspended], NOW)).toBe(suspended);
    expect(pickActiveRestriction([row("restricted", 1), restricted], NOW)).toBe(
      restricted,
    );
  });

  it("tells a suspension from a restriction", () => {
    expect(isSuspendedRestriction({ level: "suspended" })).toBe(true);
    expect(isSuspendedRestriction({ level: "restricted" })).toBe(false);
  });
});

describe("blockUserSchema", () => {
  const valid = {
    userId: 3,
    level: "restricted",
    duration: "7d",
    reason: "  spam in chat  ",
  };

  it("accepts a valid block and trims the reason", () => {
    expect(blockUserSchema.parse(valid)).toEqual({
      ...valid,
      reason: "spam in chat",
    });
  });

  it("requires a reason, with the Vietnamese message", () => {
    const result = blockUserSchema.safeParse({ ...valid, reason: "   " });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      RESTRICTION_MESSAGES.REASON_REQUIRED,
    );
  });

  it("limits the reason to 300 characters", () => {
    expect(
      blockUserSchema.safeParse({ ...valid, reason: "a".repeat(300) }).success,
    ).toBe(true);

    const tooLong = blockUserSchema.safeParse({
      ...valid,
      reason: "a".repeat(301),
    });

    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toBe(
      RESTRICTION_MESSAGES.REASON_TOO_LONG,
    );
  });

  it("rejects an unknown level, duration or user id", () => {
    expect(
      blockUserSchema.safeParse({ ...valid, level: "banned" }).success,
    ).toBe(false);
    expect(
      blockUserSchema.safeParse({ ...valid, duration: "1y" }).success,
    ).toBe(false);
    expect(blockUserSchema.safeParse({ ...valid, userId: 0 }).success).toBe(
      false,
    );
    expect(blockUserSchema.safeParse({ ...valid, userId: "3" }).success).toBe(
      false,
    );
  });

  it("is the API body without the user id", () => {
    const body = {
      level: valid.level,
      duration: valid.duration,
      reason: valid.reason,
    };

    expect(blockUserRequestSchema.parse(body)).toEqual({
      ...body,
      reason: "spam in chat",
    });
  });
});

describe("describeSuspensionVi", () => {
  it("shows the end in Vietnam time and the reason", () => {
    // 10:00 UTC is 17:00 in Ho Chi Minh City.
    expect(formatRestrictionEndVi(NOW)).toBe("14/11/2026 17:00");
    expect(describeSuspensionVi({ until: NOW, reason: "spam" })).toBe(
      "Tài khoản của bạn đã bị khoá đến 14/11/2026 17:00. Lý do: spam",
    );
  });

  it("says permanent without an end", () => {
    expect(describeSuspensionVi({ until: null, reason: "spam" })).toBe(
      "Tài khoản của bạn đã bị khoá vĩnh viễn. Lý do: spam",
    );
  });
});
