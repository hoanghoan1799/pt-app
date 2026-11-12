import { describe, expect, it } from "vitest";

import { normalizeCopyTargets } from "@/features/workouts/utils/copy-day";

const today = "2026-11-09";

describe("normalizeCopyTargets", () => {
  it("drops duplicates and the source date, keeping the order", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-12", "2026-11-10", "2026-11-11", "2026-11-12"],
        today,
      }),
    ).toEqual({ dates: ["2026-11-12", "2026-11-11"], hasPast: false });
  });

  it("flags a date before today but accepts today itself", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-09"],
        today,
      }).hasPast,
    ).toBe(false);
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-11", "2026-11-08"],
        today,
      }).hasPast,
    ).toBe(true);
  });

  it("returns no dates when only the source was asked for", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-10"],
        today,
      }),
    ).toEqual({ dates: [], hasPast: false });
  });

  it("does not count a dropped source in the past as a past target", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-01",
        dates: ["2026-11-01", "2026-11-12"],
        today,
      }),
    ).toEqual({ dates: ["2026-11-12"], hasPast: false });
  });
});
