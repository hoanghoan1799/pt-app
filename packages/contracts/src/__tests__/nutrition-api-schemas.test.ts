import {
  addMealLogBodySchema,
  bodyProfileBodySchema,
  copyInfoQuerySchema,
  foodEntryBodySchema,
  nutritionOverviewResponseSchema,
  renameMealBodySchema,
  targetBodySchema,
  weekQuerySchema,
} from "../index.js";
import { describe, expect, it } from "vitest";

describe("REST request bodies", () => {
  it("target body is the form target without the trainee id", () => {
    expect(
      targetBodySchema.parse({ carbs: "250", protein: "160", fat: "60" }),
    ).toEqual({ carbs: 250, protein: 160, fat: 60, note: "" });
    expect(
      targetBodySchema.safeParse({ carbs: "250", protein: "-1", fat: "60" })
        .success,
    ).toBe(false);
  });

  it("body profile accepts the checkbox text or a boolean, and a decimal comma", () => {
    const base = {
      sex: "male",
      age: "30",
      heightCm: "175",
      weightKg: "75,5",
      activityLevel: "moderate",
      kcalAdjustment: "-300",
      proteinPerKg: "2",
    };

    expect(bodyProfileBodySchema.parse({ ...base, applyToTarget: "on" })).toMatchObject({ weightKg: 75.5, kcalAdjustment: -300, applyToTarget: true });
    expect(bodyProfileBodySchema.parse({ ...base, applyToTarget: true }).applyToTarget).toBe(true);
    expect(bodyProfileBodySchema.parse({ ...base, applyToTarget: false }).applyToTarget).toBe(false);
    expect(bodyProfileBodySchema.parse(base).applyToTarget).toBe(false);
  });

  it("food entry body has no entry id", () => {
    expect(
      foodEntryBodySchema.parse({ date: "2026-11-12", meal: "lunch", carbs: "10", entryId: "5" }),
    ).toEqual({ date: "2026-11-12", meal: "lunch", description: "", carbs: 10, protein: null, fat: null });
  });

  it("meal log body is the log schema without the meal id", () => {
    expect(addMealLogBodySchema.parse({ kind: "library", foodId: 3, grams: 150.04 })).toEqual({ kind: "library", foodId: 3, grams: 150 });
    expect(addMealLogBodySchema.safeParse({ kind: "library", foodId: 3, grams: 0 }).success).toBe(false);
    expect(addMealLogBodySchema.parse({ kind: "free", customName: " Phở ", grams: 0, kcal: 450 })).toMatchObject({ customName: "Phở", kcal: 450, protein: null });
  });

  it("rename body collapses spaces", () => {
    expect(renameMealBodySchema.parse({ name: "  Bữa   phụ " })).toEqual({ name: "Bữa phụ" });
  });

  it("week query takes a valid date or nothing", () => {
    expect(weekQuerySchema.parse({})).toEqual({});
    expect(weekQuerySchema.parse({ week: "2026-11-12" })).toEqual({ week: "2026-11-12" });
    expect(weekQuerySchema.safeParse({ week: "2026-13-01" }).success).toBe(false);
  });

  it("copy info range is at most 6 weeks, ordered, and never throws on junk", () => {
    expect(copyInfoQuerySchema.safeParse({ from: "2026-11-01", to: "2026-12-01" }).success).toBe(true);
    expect(copyInfoQuerySchema.safeParse({ from: "2026-12-01", to: "2026-11-01" }).success).toBe(false);
    expect(copyInfoQuerySchema.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success).toBe(false);
    expect(copyInfoQuerySchema.safeParse({ from: "x", to: "y" }).success).toBe(false);
  });
});

describe("response schemas", () => {
  it("validate an empty overview", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-11-${String(9 + i).padStart(2, "0")}`,
      target: null,
      entries: [],
      loggedCount: 0,
      totals: { carbs: 0, protein: 0, fat: 0 },
      totalKcal: 0,
    }));

    expect(
      nutritionOverviewResponseSchema.safeParse({
        today: "2026-11-12",
        weekStart: "2026-11-09",
        latestTarget: null,
        bodyProfile: null,
        days,
        summary: { loggedDays: 0, averages: { carbs: 0, protein: 0, fat: 0 }, averageKcal: 0, onTargetDays: 0 },
        weightWeeks: [],
        weightChange: { latest: null, weekChange: null, totalChange: null },
        todayWeight: null,
      }).success,
    ).toBe(true);
  });
});
