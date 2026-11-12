import { describe, expect, it } from "vitest";

import {
  canViewTrainingStats,
  computeDayStreak,
} from "@/features/social/utils/streak-rules";

const TODAY = "2026-11-11";

describe("computeDayStreak", () => {
  it("is 0 for an empty list", () => {
    expect(computeDayStreak([], TODAY)).toBe(0);
  });

  it("counts today and the days before it", () => {
    expect(
      computeDayStreak(["2026-11-11", "2026-11-10", "2026-11-09"], TODAY),
    ).toBe(3);
  });

  it("starts from yesterday when today has no completion", () => {
    expect(computeDayStreak(["2026-11-10", "2026-11-09"], TODAY)).toBe(2);
  });

  it("is 0 when neither today nor yesterday has one", () => {
    expect(computeDayStreak(["2026-11-09", "2026-11-08"], TODAY)).toBe(0);
  });

  it("stops at the first gap", () => {
    expect(
      computeDayStreak(
        ["2026-11-11", "2026-11-10", "2026-11-08", "2026-11-07"],
        TODAY,
      ),
    ).toBe(2);
  });

  it("counts a duplicated date once", () => {
    expect(
      computeDayStreak(["2026-11-11", "2026-11-11", "2026-11-10"], TODAY),
    ).toBe(2);
  });

  it("does not depend on input order", () => {
    expect(
      computeDayStreak(["2026-11-09", "2026-11-11", "2026-11-10"], TODAY),
    ).toBe(3);
  });

  it("ignores future dates and crosses a month boundary", () => {
    expect(
      computeDayStreak(
        ["2026-11-12", "2026-10-31", "2026-10-30"],
        "2026-11-01",
      ),
    ).toBe(2);
  });
});

describe("canViewTrainingStats", () => {
  const base = { isOwn: false, isAdminViewer: false, relationship: null };

  it("shows to the owner, admins and accepted friends", () => {
    expect(canViewTrainingStats({ ...base, isOwn: true })).toBe(true);
    expect(canViewTrainingStats({ ...base, isAdminViewer: true })).toBe(true);
    expect(canViewTrainingStats({ ...base, relationship: "friends" })).toBe(
      true,
    );
  });

  it("hides from everyone else", () => {
    for (const relationship of [null, "none", "sent", "received"]) {
      expect(canViewTrainingStats({ ...base, relationship })).toBe(false);
    }
  });
});
