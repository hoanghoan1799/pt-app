import { describe, expect, it } from "vitest";

import {
  type CountedItem,
  type CountedLog,
  type FrozenItem,
  listMealNutrition,
  macrosOf,
  nutritionOfFood,
  resolveLogNutrition,
  sumLogNutrition,
  sumMacros,
} from "./meal-log.js";
import { calculateCalories as kcalOf } from "./nutrition-math.js";

const countMealNutrition = (
  items: CountedItem[],
  logs: CountedLog[],
  isAchieved: boolean,
  frozen: FrozenItem[] = [],
) => sumLogNutrition(listMealNutrition(items, logs, isAchieved, frozen));

const countMealEntries = (
  items: CountedItem[],
  logs: CountedLog[],
  isAchieved: boolean,
  frozen: FrozenItem[] = [],
) => listMealNutrition(items, logs, isAchieved, frozen).length;

const NONE = { kcal: null, protein: null, carbs: null, fat: null };
const CHICKEN = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };

describe("resolveLogNutrition", () => {
  it("scales a library food by grams", () => {
    // 200 g of chicken: P 62, F 7.2 -> 4/4/9 = 248 + 64.8 = 312.8 kcal (the
    // library's own 165 kcal/100 g is not used, like everywhere else).
    expect(resolveLogNutrition(200, CHICKEN, NONE)).toEqual({
      kcal: 312.8,
      protein: 62,
      carbs: 0,
      fat: 7.2,
    });
  });

  it("uses what was typed for a free food and counts a blank macro as 0", () => {
    expect(
      resolveLogNutrition(0, null, { ...NONE, kcal: 450, protein: 20 }),
    ).toEqual({ kcal: 450, protein: 20, carbs: 0, fat: 0 });
  });

  it("derives kcal from the macros (4/4/9) when kcal is blank", () => {
    // 20 g P + 50 g C + 10 g F = 80 + 200 + 90 = 370 kcal.
    expect(
      resolveLogNutrition(0, null, {
        ...NONE,
        protein: 20,
        carbs: 50,
        fat: 10,
      }),
    ).toEqual({ kcal: 370, protein: 20, carbs: 50, fat: 10 });
  });

  it("is null when a free food has no numbers", () => {
    expect(resolveLogNutrition(150, null, NONE)).toBeNull();
  });
});

describe("eating exactly the plan", () => {
  it("gives the same kcal as the plan", () => {
    // Plan: 200 g chicken + 300 g rice. The plan side is kcalOf(sumItems).
    const rice = { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 };
    const planned = kcalOf(
      sumMacros([macrosOf(CHICKEN, 200), macrosOf(rice, 300)]),
    );
    const eaten = sumLogNutrition([
      resolveLogNutrition(200, CHICKEN, NONE),
      resolveLogNutrition(300, rice, NONE),
    ]);

    // P 70.1, C 84.6, F 8.1 -> 280.4 + 338.4 + 72.9 = 691.7 kcal.
    expect(planned).toBeCloseTo(691.7, 6);
    expect(eaten.kcal).toBeCloseTo(planned, 6);
  });
});

describe("sumLogNutrition", () => {
  it("adds the foods and ignores those without numbers", () => {
    expect(
      sumLogNutrition([
        { kcal: 312.8, protein: 62, carbs: 0, fat: 7.2 },
        null,
        { kcal: 370, protein: 20, carbs: 50, fat: 10 },
      ]),
    ).toEqual({ kcal: 682.8, protein: 82, carbs: 50, fat: 17.2 });
  });

  it("is all zero for nothing logged", () => {
    expect(sumLogNutrition([])).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe("countMealNutrition", () => {
  // Per 100 g: chicken P 31 / F 3.6, rice P 2.7 / C 28.2 / F 0.3.
  const RICE = { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 };
  const items = [
    { foodId: 1, grams: 200, food: CHICKEN },
    { foodId: 2, grams: 300, food: RICE },
  ];
  const logOf = (foodId: number | null, grams: number, food = CHICKEN) => ({
    foodId,
    nutrition: resolveLogNutrition(grams, food, NONE),
  });
  const freeLog = (typed: {
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  }) => ({
    foodId: null,
    nutrition: resolveLogNutrition(0, null, typed),
  });

  it("counts the logs only when the meal is not marked", () => {
    expect(countMealNutrition(items, [logOf(1, 100)], false)).toEqual({
      kcal: 156.4,
      protein: 31,
      carbs: 0,
      fat: 3.6,
    });
    expect(countMealNutrition(items, [], false)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it("counts the whole plan for a marked meal with no logs", () => {
    // 200 g chicken: P 62, F 7.2. 300 g rice: P 8.1, C 84.6, F 0.9.
    const eaten = countMealNutrition(items, [], true);

    expect(eaten.protein).toBeCloseTo(70.1, 5);
    expect(eaten.carbs).toBeCloseTo(84.6, 5);
    expect(eaten.fat).toBeCloseTo(8.1, 5);
    // 4 * 84.6 + 4 * 70.1 + 9 * 8.1 = 338.4 + 280.4 + 72.9
    expect(eaten.kcal).toBeCloseTo(691.7, 5);
  });

  it("counts a planned food logged at other grams once, at the logged grams", () => {
    // Chicken logged 100 g instead of 200 g; rice stays at the plan.
    const eaten = countMealNutrition(items, [logOf(1, 100)], true);

    expect(eaten.protein).toBeCloseTo(31 + 8.1, 5);
    expect(eaten.carbs).toBeCloseTo(84.6, 5);
    expect(eaten.fat).toBeCloseTo(3.6 + 0.9, 5);
  });

  it("adds an off-menu free food on top of the plan", () => {
    const eaten = countMealNutrition(
      items,
      [freeLog({ kcal: 300, protein: null, carbs: null, fat: null })],
      true,
    );

    expect(eaten.kcal).toBeCloseTo(691.7 + 300, 5);
    expect(eaten.protein).toBeCloseTo(70.1, 5);
  });

  it("adds a library food that is not in the plan", () => {
    const eaten = countMealNutrition(items, [logOf(3, 100)], true);

    expect(eaten.protein).toBeCloseTo(70.1 + 31, 5);
  });

  it("counts a planned food whose row is gone as 0 g", () => {
    const eaten = countMealNutrition(
      [{ foodId: 9, grams: 500, food: null }],
      [],
      true,
    );

    expect(eaten).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("countMealEntries", () => {
  const items = [
    { foodId: 1, grams: 200, food: CHICKEN },
    { foodId: 2, grams: 300, food: CHICKEN },
  ];
  const log = { foodId: 1, nutrition: null };

  it("counts logs, plus the planned foods not logged when marked", () => {
    expect(countMealEntries(items, [log], false)).toBe(1);
    expect(countMealEntries(items, [log], true)).toBe(2);
    expect(countMealEntries(items, [], true)).toBe(2);
  });
});

describe("stored numbers of a library log (KAN-93)", () => {
  it("prefers the stored numbers over the food's current macros", () => {
    // Logged when chicken was P 31 / F 3.6; the food was edited to P 20 since.
    const edited = { kcal: 100, protein: 20, carbs: 0, fat: 1 };
    const stored = { kcal: 312.8, protein: 62, carbs: 0, fat: 7.2 };

    expect(resolveLogNutrition(200, edited, stored)).toEqual(stored);
  });

  it("reads a library log with all four numbers null live (logged before KAN-93)", () => {
    expect(resolveLogNutrition(200, CHICKEN, NONE)).toEqual({
      kcal: 312.8,
      protein: 62,
      carbs: 0,
      fat: 7.2,
    });
  });
});

describe("a meal marked with frozen items (KAN-93)", () => {
  const RICE = { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 };
  // Marked when the plan was 200 g chicken + 300 g rice.
  const frozen = [
    { foodId: 1, nutrition: nutritionOfFood(CHICKEN, 200) },
    { foodId: 2, nutrition: nutritionOfFood(RICE, 300) },
  ];
  // The PT has since changed the chicken to 400 g and dropped the rice.
  const liveItems = [{ foodId: 1, grams: 400, food: CHICKEN }];

  it("counts the frozen items, not the edited plan", () => {
    const eaten = countMealNutrition(liveItems, [], true, frozen);

    expect(eaten.protein).toBeCloseTo(70.1, 5);
    expect(eaten.carbs).toBeCloseTo(84.6, 5);
    expect(eaten.fat).toBeCloseTo(8.1, 5);
    expect(eaten.kcal).toBeCloseTo(691.7, 5);
  });

  it("ignores a changed food macro", () => {
    const changed = { ...CHICKEN, protein: 10 };
    const eaten = countMealNutrition(
      [{ foodId: 1, grams: 200, food: changed }],
      [],
      true,
      frozen,
    );

    expect(eaten.protein).toBeCloseTo(70.1, 5);
  });

  it("lets a log of the same food replace its frozen item (KAN-87)", () => {
    const log = {
      foodId: 1,
      nutrition: resolveLogNutrition(50, CHICKEN, NONE),
    };
    const eaten = countMealNutrition(liveItems, [log], true, frozen);

    // 50 g chicken P 15.5 / F 1.8 + 300 g rice P 8.1 / C 84.6 / F 0.9.
    expect(eaten.protein).toBeCloseTo(23.6, 5);
    expect(eaten.carbs).toBeCloseTo(84.6, 5);
    expect(eaten.fat).toBeCloseTo(2.7, 5);
    expect(countMealEntries(liveItems, [log], true, frozen)).toBe(2);
  });

  it("reads the live plan when nothing was frozen (marked before KAN-93)", () => {
    const eaten = countMealNutrition(liveItems, [], true, []);

    expect(eaten.protein).toBeCloseTo(124, 5);
  });

  it("counts nothing from the frozen items when not marked", () => {
    expect(countMealNutrition(liveItems, [], false, frozen)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});
