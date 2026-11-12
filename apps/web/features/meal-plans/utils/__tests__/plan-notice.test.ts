import { describe, expect, it } from "vitest";

import {
  formatPlanKcalNotice,
  getPlanKcalNotices,
} from "@/features/meal-plans/utils/plan-notice";

describe("getPlanKcalNotices", () => {
  it("flags a plan above the target and keeps the sign", () => {
    // 2,195 planned vs 2,075 target = +120.
    expect(
      getPlanKcalNotices([
        { date: "2026-11-02", plannedKcal: 2195, targetKcal: 2075 },
      ]),
    ).toEqual([{ date: "2026-11-02", gapKcal: 120 }]);
  });

  it("flags a plan below the target with a minus", () => {
    expect(
      getPlanKcalNotices([
        { date: "2026-11-02", plannedKcal: 1900, targetKcal: 2075 },
      ]),
    ).toEqual([{ date: "2026-11-02", gapKcal: -175 }]);
  });

  it("does not flag 80 kcal exactly or less, flags 81", () => {
    expect(
      getPlanKcalNotices([
        { date: "2026-11-02", plannedKcal: 2155, targetKcal: 2075 },
        { date: "2026-11-03", plannedKcal: 1995, targetKcal: 2075 },
        { date: "2026-11-04", plannedKcal: 2156, targetKcal: 2075 },
      ]),
    ).toEqual([{ date: "2026-11-04", gapKcal: 81 }]);
  });

  it("rounds the gap to whole kcal", () => {
    // 2,160.4 - 2,075 = 85.4 -> 85.
    expect(
      getPlanKcalNotices([
        { date: "2026-11-02", plannedKcal: 2160.4, targetKcal: 2075 },
      ]),
    ).toEqual([{ date: "2026-11-02", gapKcal: 85 }]);
  });

  it("skips empty plans and days without a target", () => {
    expect(
      getPlanKcalNotices([
        { date: "2026-11-02", plannedKcal: 0, targetKcal: 2075 },
        { date: "2026-11-03", plannedKcal: 2500, targetKcal: null },
      ]),
    ).toEqual([]);
  });

  it("returns the oldest day first", () => {
    expect(
      getPlanKcalNotices([
        { date: "2026-11-05", plannedKcal: 2300, targetKcal: 2075 },
        { date: "2026-11-03", plannedKcal: 2400, targetKcal: 2075 },
      ]).map((notice) => notice.date),
    ).toEqual(["2026-11-03", "2026-11-05"]);
  });
});

describe("formatPlanKcalNotice", () => {
  it("shows the sign", () => {
    expect(formatPlanKcalNotice(120)).toBe(
      "Plan lệch +120 kcal so với mục tiêu mới",
    );
    expect(formatPlanKcalNotice(-175)).toBe(
      "Plan lệch -175 kcal so với mục tiêu mới",
    );
  });
});
