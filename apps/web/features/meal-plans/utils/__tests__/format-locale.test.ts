import { describeKcalGapVi } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { describeKcalGap } from "@/features/foods/utils/food-math";
import {
  formatDeletePlanQuestion,
  formatOverwriteLogWarning,
  formatOverwriteQuestion,
} from "@/features/meal-plans/utils/overwrite-message";
import { formatPlanKcalNotice } from "@/features/meal-plans/utils/plan-notice";

describe("meal plan text per locale", () => {
  it("asks about overwriting in English", () => {
    expect(formatOverwriteQuestion(["2026-10-27", "2026-10-29"], "en")).toBe(
      "Overwrite the plan for Tue Oct 27, Thu Oct 29?",
    );
    expect(
      formatOverwriteLogWarning(["2026-10-27"], ["2026-10-27"], "en"),
    ).toBe(
      "The trainee logged meals on Tue Oct 27; overwriting deletes that log.",
    );
    expect(formatOverwriteLogWarning(["2026-10-27"], [], "en")).toBeNull();
    expect(formatDeletePlanQuestion(false, "en")).toBe(
      "Delete the plan for this day?",
    );
    expect(formatDeletePlanQuestion(true, "en")).toMatch(/logged meals/);
  });

  it("keeps the Vietnamese overwrite question by default", () => {
    expect(formatOverwriteQuestion(["2026-10-27"])).toBe(
      "Ghi đè plan của T3 27/10?",
    );
  });

  it("words the plan notice and kcal gap in English", () => {
    expect(formatPlanKcalNotice(120, "en")).toBe(
      "Plan is +120 kcal off the new target",
    );
    expect(formatPlanKcalNotice(-95, "en")).toBe(
      "Plan is -95 kcal off the new target",
    );
    expect(
      describeKcalGap(500, { protein: 10, carbs: 10, fat: 10 }, "en"),
    ).toBe(
      "Entered 500 kcal is 66% off the 170 kcal calculated from protein/carbs/fat (4/4/9).",
    );
  });
});

describe("kcal gap text", () => {
  it("matches the Vietnamese sentence the shared food schema uses", () => {
    const macros = { protein: 10, carbs: 10, fat: 10 };

    expect(describeKcalGap(500, macros, "vi")).toBe(
      describeKcalGapVi(500, macros),
    );
  });
});
