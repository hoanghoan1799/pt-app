import { describe, expect, it } from "vitest";

import {
  describeBests,
  describeTrend,
} from "@/features/members/utils/progress-text";

describe("describeTrend", () => {
  it("shows 'Lần đầu' for a first weighted session (C5)", () => {
    expect(describeTrend({ trend: "first", changeKg: null })).toEqual({
      label: "Lần đầu",
      tone: "neutral",
    });
  });

  it("shows the gain with a decimal comma", () => {
    expect(describeTrend({ trend: "up", changeKg: 2.5 })).toEqual({
      label: "+2,5 kg",
      tone: "up",
    });
  });

  it("explains a rep-only gain at the same weight", () => {
    expect(describeTrend({ trend: "up", changeKg: 0 }).label).toBe(
      "Cùng mức, thêm reps",
    );
  });

  it("shows a decrease with a minus sign", () => {
    expect(describeTrend({ trend: "down", changeKg: -2.5 })).toEqual({
      label: "−2,5 kg",
      tone: "down",
    });
  });

  it("explains fewer reps at the same weight instead of '0 kg'", () => {
    expect(describeTrend({ trend: "down", changeKg: 0 })).toEqual({
      label: "Cùng mức, ít reps",
      tone: "down",
    });
  });

  it("falls back safely when changeKg is missing", () => {
    expect(describeTrend({ trend: "up", changeKg: null }).label).toBe(
      "Cùng mức, thêm reps",
    );
    expect(describeTrend({ trend: "down", changeKg: null }).label).toBe(
      "Cùng mức, ít reps",
    );
  });

  it("shows 'Không đổi' for a tie", () => {
    expect(describeTrend({ trend: "same", changeKg: 0 })).toEqual({
      label: "Không đổi",
      tone: "neutral",
    });
  });
});

describe("describeBests", () => {
  it("shows both bests with a decimal comma", () => {
    expect(
      describeBests({
        weekBest: { weightKg: 42.5, reps: 8 },
        previousBest: { weightKg: 40, reps: 10 },
      }),
    ).toEqual([
      "Tốt nhất trước đó 40 kg × 10",
      "Tốt nhất tuần này 42,5 kg × 8",
    ]);
  });

  it("omits the previous best on a first session", () => {
    expect(
      describeBests({
        weekBest: { weightKg: 40, reps: 10 },
        previousBest: null,
      }),
    ).toEqual(["Tốt nhất tuần này 40 kg × 10"]);
  });
});
