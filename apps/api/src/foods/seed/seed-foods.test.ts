import { isKcalGapTooLarge, toNameKey } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { SEED_FOOD_TRANSLATIONS } from "./food-translations.js";
import { SEED_FOODS, type SeedFood } from "./seed-foods.js";

// Ported from apps/web scripts/__tests__/seed-foods.test.ts and
// food-locale.test.ts: the starter data must stay identical.
const KCAL_EXCEPTIONS = [
  "Bông cải xanh (sống)",
  "Bông cải xanh (luộc)",
  "Cà chua (sống)",
  "Dưa leo (sống)",
  "Cải bó xôi (sống)",
  "Xà lách (sống)",
  "Bắp cải (sống)",
  "Nấm trắng (sống)",
  "Chuối",
  "Táo",
  "Cam",
  "Xoài",
  "Dưa hấu",
  "Đu đủ",
];

const byName = (name: string): SeedFood => {
  const food = SEED_FOODS.find((item) => item.name === name);

  if (!food) {
    throw new Error(`missing seed food ${name}`);
  }
  return food;
};

describe("starter foods data", () => {
  it("has about 60 foods with unique names and a USDA source each", () => {
    const keys = SEED_FOODS.map((food) => toNameKey(food.name));

    expect(SEED_FOODS.length).toBeGreaterThanOrEqual(55);
    expect(SEED_FOODS.length).toBeLessThanOrEqual(70);
    expect(new Set(keys).size).toBe(SEED_FOODS.length);
    expect(SEED_FOODS.every((food) => food.source.startsWith("USDA"))).toBe(
      true,
    );
  });

  it("covers every group except prepared dishes", () => {
    expect([...new Set(SEED_FOODS.map((food) => food.group))].sort()).toEqual([
      "egg_dairy",
      "fat_oil",
      "fruit",
      "legume_nut",
      "meat",
      "other",
      "seafood",
      "starch",
      "vegetable",
    ]);
  });

  it("keeps the cooked staples from the worked example", () => {
    expect(byName("Cơm trắng (chín)")).toMatchObject({
      kcal: 130,
      protein: 2.7,
      carbs: 28.2,
      fat: 0.3,
    });
    expect(byName("Trứng gà luộc")).toMatchObject({
      kcal: 155,
      servingLabel: "1 quả",
      servingGrams: 50,
    });
    expect(byName("Dầu ăn (dầu đậu nành)")).toMatchObject({
      kcal: 884,
      fat: 100,
    });
  });

  it("keeps every macro and kcal inside the form limits", () => {
    for (const food of SEED_FOODS) {
      expect(food.protein + food.carbs + food.fat).toBeLessThanOrEqual(100);
      expect(food.kcal).toBeLessThanOrEqual(910);
      expect(food.servingLabel === undefined).toBe(
        food.servingGrams === undefined,
      );
    }
  });

  it("matches the 4/4/9 estimate within 10 %, except the listed low-energy plants", () => {
    const outliers = SEED_FOODS.filter((food) =>
      isKcalGapTooLarge(food.kcal, food),
    );

    expect(outliers.map((food) => food.name).sort()).toEqual(
      [...KCAL_EXCEPTIONS].sort(),
    );
  });
});

describe("SEED_FOOD_TRANSLATIONS", () => {
  it("has a non-empty en and zh name for every seed food and nothing else", () => {
    const keys = SEED_FOODS.map((food) => toNameKey(food.name));

    for (const key of keys) {
      expect(SEED_FOOD_TRANSLATIONS[key]?.en.trim()).toBeTruthy();
      expect(SEED_FOOD_TRANSLATIONS[key]?.zh.trim()).toBeTruthy();
    }
    expect(Object.keys(SEED_FOOD_TRANSLATIONS).sort()).toEqual(
      [...keys].sort(),
    );
  });

  it("translates the chicken breast as the design says", () => {
    expect(SEED_FOOD_TRANSLATIONS["uc ga (chin)"]).toEqual({
      en: "Chicken breast (cooked)",
      zh: "鸡胸肉（熟）",
    });
  });
});
