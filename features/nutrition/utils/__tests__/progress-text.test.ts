import { describe, expect, it } from "vitest";

import { formatComparison } from "@/features/nutrition/utils/progress-text";

describe("formatComparison", () => {
  it("formats each status", () => {
    expect(
      formatComparison({ status: "under", difference: 50, percent: 75 }, "g"),
    ).toBe("còn 50 g");
    expect(
      formatComparison(
        { status: "over", difference: 1234.4, percent: 160 },
        "kcal",
      ),
    ).toBe("vượt 1.234 kcal");
    expect(
      formatComparison({ status: "on", difference: 3, percent: 99 }, "g"),
    ).toBe("đạt ✓");
    expect(
      formatComparison({ status: "none", difference: 0, percent: 0 }, "g"),
    ).toBe("");
  });
});
