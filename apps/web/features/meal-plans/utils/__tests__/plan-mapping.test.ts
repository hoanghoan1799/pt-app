import type {
  MealLogResponse,
  MealMarkResponse,
  PlanDayResponse,
} from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  toMealLogData,
  toPlanDays,
  toPlanFood,
} from "@/features/meal-plans/utils/plan-mapping";

// The read models (which rows, archived foods kept, resolved log numbers) are
// built by the API (apps/api/test/meal-plans.e2e.test.ts, meal-logs.e2e.test.ts
// and src/nutrition/mappers.test.ts). These cover the web's side: naming in
// the user's language and narrowing the week to the selected day.

const CHICKEN = {
  id: 1,
  name: "Ức gà (chín)",
  nameKey: "uc ga (chin)",
  nameEn: null,
  nameZh: null,
  group: "meat" as const,
  state: "cooked" as const,
  kcal: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
};

const log = (overrides: Partial<MealLogResponse>): MealLogResponse => ({
  id: 1,
  mealId: 10,
  foodId: 1,
  name: CHICKEN.name,
  nameEn: null,
  nameZh: null,
  isFree: false,
  isArchived: false,
  isMissingFood: false,
  grams: 100,
  typed: { kcal: null, protein: null, carbs: null, fat: null },
  nutrition: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  ...overrides,
});

describe("toPlanFood", () => {
  it("keeps the stored name in Vietnamese and adds no search key", () => {
    const food = toPlanFood(CHICKEN, false, "vi");

    expect(food.name).toBe("Ức gà (chín)");
    expect(food).not.toHaveProperty("searchKey");
    expect(food.isArchived).toBe(false);
  });

  it("names the food in English and searches both names", () => {
    const food = toPlanFood(
      { ...CHICKEN, nameEn: "Chicken breast" },
      true,
      "en",
    );

    expect(food.name).toBe("Chicken breast");
    expect(food.searchKey).toBe("uc ga (chin) chicken breast");
    expect(food.isArchived).toBe(true);
  });

  it("falls back to the starter food's translation, then to the stored name", () => {
    expect(toPlanFood(CHICKEN, false, "en").name).not.toBe("");
    expect(
      toPlanFood(
        { ...CHICKEN, name: "Món riêng", nameKey: "mon rieng" },
        false,
        "zh",
      ).name,
    ).toBe("Món riêng");
  });
});

describe("toPlanDays", () => {
  it("maps meals and items, flagging archived foods", () => {
    const days: PlanDayResponse[] = [
      {
        id: 7,
        date: "2026-11-02",
        meals: [
          {
            id: 10,
            position: 0,
            name: "Bữa sáng",
            sharePercent: 40,
            items: [
              {
                id: 100,
                foodId: 1,
                grams: 200,
                food: { ...CHICKEN, isArchived: true },
              },
            ],
          },
        ],
      },
    ];

    expect(toPlanDays(days, "vi")).toEqual([
      {
        id: 7,
        date: "2026-11-02",
        meals: [
          {
            id: 10,
            position: 0,
            name: "Bữa sáng",
            sharePercent: 40,
            items: [
              {
                id: 100,
                foodId: 1,
                grams: 200,
                food: expect.objectContaining({ id: 1, isArchived: true }),
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("toMealLogData", () => {
  const marks: MealMarkResponse[] = [
    { mealId: 10, achieved: true, note: "", frozen: [] },
    { mealId: 11, achieved: false, note: "thiếu cơm", frozen: [] },
  ];

  it("keeps only the logs and marks of the selected meals", () => {
    const result = toMealLogData(
      [log({ id: 1, mealId: 10 }), log({ id: 2, mealId: 11 })],
      marks,
      [10],
      "vi",
    );

    expect(result.logs.map((item) => item.id)).toEqual([1]);
    expect(result.marks.map((mark) => mark.mealId)).toEqual([10]);
    expect(toMealLogData([log({})], marks, [], "vi")).toEqual({
      logs: [],
      marks: [],
    });
  });

  it("names a library log in the user's language", () => {
    const result = toMealLogData(
      [log({ nameEn: "Chicken breast" })],
      [],
      [10],
      "en",
    );

    expect(result.logs[0].name).toBe("Chicken breast");
  });

  it("keeps what the trainee typed for a free food", () => {
    const result = toMealLogData(
      [
        log({
          foodId: null,
          isFree: true,
          name: "Bánh quy",
          typed: { kcal: 150, protein: null, carbs: null, fat: null },
        }),
      ],
      [],
      [10],
      "en",
    );

    expect(result.logs[0]).toMatchObject({
      name: "Bánh quy",
      isFree: true,
      typed: { kcal: 150, protein: null, carbs: null, fat: null },
    });
  });

  it("gives a vanished food its localized placeholder name", () => {
    const vi = toMealLogData(
      [log({ isMissingFood: true, name: "Món không còn trong thư viện" })],
      [],
      [10],
      "vi",
    );
    const en = toMealLogData(
      [log({ isMissingFood: true, name: "Món không còn trong thư viện" })],
      [],
      [10],
      "en",
    );

    expect(vi.logs[0].name).toBe("Món không còn trong thư viện");
    expect(en.logs[0].name).not.toBe("Món không còn trong thư viện");
    expect(en.logs[0].isMissingFood).toBe(true);
  });
});
