import { describe, expect, it } from "vitest";

import type { FoodFacts } from "../foods/food-facts.service.js";
import {
  toBodyProfileDetail,
  toDayResponse,
  toPlanFoodResponse,
  toTargetResponse,
} from "./mappers.js";

const FOOD: FoodFacts = {
  id: 7,
  name: "Ức gà",
  nameKey: "uc ga",
  nameEn: "Chicken breast",
  nameZh: null,
  group: "meat",
  state: "cooked",
  kcal: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
  archivedAt: null,
};

describe("toPlanFoodResponse", () => {
  it("lists the fields explicitly and flags archived foods", () => {
    expect(toPlanFoodResponse(FOOD)).toEqual({
      id: 7,
      name: "Ức gà",
      nameKey: "uc ga",
      nameEn: "Chicken breast",
      nameZh: null,
      group: "meat",
      state: "cooked",
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      isArchived: false,
    });
    expect(
      toPlanFoodResponse({ ...FOOD, archivedAt: new Date() }).isArchived,
    ).toBe(true);
  });
});

describe("toTargetResponse", () => {
  it("copies only the public fields", () => {
    const row = {
      effectiveFrom: "2026-11-12",
      carbs: 1,
      protein: 2,
      fat: 3,
      note: "n",
      source: "tdee" as const,
      userId: 5,
    };

    expect(toTargetResponse(row)).toEqual({
      effectiveFrom: "2026-11-12",
      carbs: 1,
      protein: 2,
      fat: 3,
      note: "n",
      source: "tdee",
    });
  });
});

describe("toBodyProfileDetail", () => {
  it("adds the energy plan for the given day", () => {
    const detail = toBodyProfileDetail(
      {
        sex: "male",
        birthYear: 1996,
        heightCm: 175,
        weightKg: 75,
        activityLevel: "moderate",
        goal: "maintain",
        kcalAdjustment: -300,
        proteinPerKg: 2,
      },
      "2026-11-12",
    );

    expect(detail.profile.kcalAdjustment).toBe(-300);
    expect(detail.energyPlan).toEqual({
      age: 30,
      bmr: 1700,
      tdee: 2630,
      targetCalories: 2330,
      isFlooredToBmr: false,
      macros: { carbs: 285, protein: 150, fat: 65 },
    });
  });
});

describe("toDayResponse", () => {
  it("maps the target and entries of a day", () => {
    const day = toDayResponse({
      date: "2026-11-12",
      target: null,
      entries: [
        {
          id: 1,
          date: "2026-11-12",
          meal: "lunch",
          description: "cơm",
          carbs: 50,
          protein: null,
          fat: null,
        },
      ],
      loggedCount: 1,
      totals: { carbs: 50, protein: 0, fat: 0 },
      totalKcal: 200,
    });

    expect(day.target).toBeNull();
    expect(day.entries[0]).toEqual({
      id: 1,
      date: "2026-11-12",
      meal: "lunch",
      description: "cơm",
      carbs: 50,
      protein: null,
      fat: null,
    });
    expect(day.totalKcal).toBe(200);
  });
});
