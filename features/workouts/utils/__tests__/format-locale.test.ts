import { describe, expect, it } from "vitest";

import {
  describeBests,
  describeTrend,
} from "@/features/members/utils/progress-text";
import { formatDecimal } from "@/features/nutrition/utils/energy";
import { formatComparison } from "@/features/nutrition/utils/progress-text";
import { formatWeightChange } from "@/features/nutrition/utils/weight";
import {
  describeMissingReps,
  describeRowError,
} from "@/features/workouts/constants/set-logger";
import {
  formatVolume,
  getDeleteConfirmMessage,
} from "@/features/workouts/utils/exercise";
import {
  formatSet,
  rowsToSetInputs,
} from "@/features/workouts/utils/set-logger";

describe("set formatting per locale", () => {
  it("formats sets and bodyweight in English", () => {
    expect(formatSet({ weightKg: 42.5, reps: 8 }, "en")).toBe("42.5 kg × 8");
    expect(formatSet({ weightKg: null, reps: 12 }, "en")).toBe(
      "Bodyweight × 12",
    );
    expect(formatSet({ weightKg: 42.5, reps: 8 }, "vi")).toBe("42,5 kg × 8");
    expect(formatSet({ weightKg: null, reps: 12 })).toBe("Tự trọng × 12");
  });

  it("describes volume with plural sets in English", () => {
    expect(formatVolume(4, "10-12", "en")).toBe("4 sets × 10-12");
    expect(formatVolume(1, "", "en")).toBe("1 set");
    expect(formatVolume(4, "10-12", "vi")).toBe("4 hiệp × 10-12");
  });

  it("words the delete confirmation in English", () => {
    expect(getDeleteConfirmMessage(false, "en")).toBe("Delete this exercise?");
    expect(getDeleteConfirmMessage(true, "en")).toMatch(
      /^The trainee has logged/,
    );
  });

  it("words row errors in English", () => {
    expect(describeMissingReps(2, "en")).toBe("Enter the reps for set 2");
    expect(describeRowError(3, "bad", "en")).toBe("Set 3: bad");
    expect(rowsToSetInputs([{ id: 0, weight: "40", reps: "" }], "en")).toEqual({
      ok: false,
      message: "Enter the reps for set 1",
    });
  });
});

describe("progress and number text per locale", () => {
  it("formats decimals and weight changes per locale", () => {
    expect(formatDecimal(72.5, "en")).toBe("72.5");
    expect(formatDecimal(72.5)).toBe("72,5");
    expect(formatWeightChange(-1.2, "en")).toBe("−1.2 kg");
    expect(formatWeightChange(0.4, "vi")).toBe("+0,4 kg");
  });

  it("compares to a target in English", () => {
    expect(
      formatComparison({ status: "under", difference: 50 } as never, "g", "en"),
    ).toBe("50 g left");
    expect(
      formatComparison(
        { status: "over", difference: 1200 } as never,
        "kcal",
        "en",
      ),
    ).toBe("1,200 kcal over");
    expect(
      formatComparison({ status: "on", difference: 0 } as never, "g", "en"),
    ).toBe("on target ✓");
  });

  it("describes trends and bests in English", () => {
    expect(describeTrend({ trend: "first", changeKg: null }, "en")).toEqual({
      label: "First time",
      tone: "neutral",
    });
    expect(describeTrend({ trend: "up", changeKg: 0 }, "en").label).toBe(
      "Same weight, more reps",
    );
    expect(describeTrend({ trend: "up", changeKg: 2.5 }, "en").label).toBe(
      "+2.5 kg",
    );
    expect(
      describeBests(
        {
          weekBest: { weightKg: 42.5, reps: 8 },
          previousBest: { weightKg: 40, reps: 10 },
        },
        "en",
      ),
    ).toEqual(["Previous best 40 kg × 10", "Best this week 42.5 kg × 8"]);
  });
});
