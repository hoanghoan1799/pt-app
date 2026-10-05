import { describe, expect, it } from "vitest";

import { formatVolume } from "@/features/workouts/utils/exercise";

describe("formatVolume", () => {
  it("joins sets and reps", () => {
    expect(formatVolume(4, "10-12")).toBe("4 hiệp × 10-12");
  });

  it("handles missing parts", () => {
    expect(formatVolume(4, " ")).toBe("4 hiệp");
    expect(formatVolume(null, "30 giây")).toBe("30 giây");
    expect(formatVolume(null, "")).toBe("");
  });
});
