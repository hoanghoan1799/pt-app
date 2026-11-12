import { describe, expect, it } from "vitest";

import { formatPlanKcalNotice } from "@/features/meal-plans/utils/plan-notice";

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
