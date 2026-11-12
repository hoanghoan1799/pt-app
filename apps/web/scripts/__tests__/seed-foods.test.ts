import { isKcalGapTooLarge } from "@pt/contracts";
import { toNameKey } from "@pt/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createTestDb } from "@/db/__tests__/create-test-db";
import { foods } from "@/db/schema";
import {
  SEED_FOODS,
  type SeedFood,
} from "@/features/foods/constants/seed-foods";
import { insertMissingSeedFoods } from "@/features/foods/services/seed-foods-service";

// Low-energy vegetables and fruit: USDA's energy for them subtracts part of
// the fibre, so it sits more than 10 % under the 4/4/9 figure. They are kept
// exactly as USDA lists them (the PT form would need the "đã kiểm tra" box).
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

describe("F12 insertMissingSeedFoods", () => {
  it("inserts every starter food once and nothing on the second run", async () => {
    const db = await createTestDb();

    expect(await insertMissingSeedFoods(db)).toBe(SEED_FOODS.length);
    expect(await db.select().from(foods)).toHaveLength(SEED_FOODS.length);

    expect(await insertMissingSeedFoods(db)).toBe(0);
    expect(await db.select().from(foods)).toHaveLength(SEED_FOODS.length);
  });

  it("only adds the foods that are missing and never overwrites an edit", async () => {
    const db = await createTestDb();

    await insertMissingSeedFoods(db, SEED_FOODS.slice(0, 10));
    await db
      .update(foods)
      .set({ kcal: 999 })
      .where(eq(foods.nameKey, toNameKey(SEED_FOODS[0].name)));

    expect(await insertMissingSeedFoods(db)).toBe(SEED_FOODS.length - 10);

    const [first] = await db
      .select()
      .from(foods)
      .where(eq(foods.nameKey, toNameKey(SEED_FOODS[0].name)));

    expect(first.kcal).toBe(999);
  });

  it("does not bring back a food the PT archived", async () => {
    const db = await createTestDb();

    await insertMissingSeedFoods(db);
    await db
      .update(foods)
      .set({ archivedAt: new Date() })
      .where(eq(foods.nameKey, toNameKey("Ức gà (chín)")));

    expect(await insertMissingSeedFoods(db)).toBe(0);
    expect(await db.select().from(foods)).toHaveLength(SEED_FOODS.length);
  });

  it("stores the chicken breast numbers the F1 example uses", async () => {
    const db = await createTestDb();

    await insertMissingSeedFoods(db);

    const [chicken] = await db
      .select()
      .from(foods)
      .where(eq(foods.nameKey, "uc ga (chin)"));

    expect(chicken).toMatchObject({
      name: "Ức gà (chín)",
      group: "meat",
      state: "cooked",
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      source: "USDA SR Legacy, FDC 171477",
    });
  });
});

describe("starter foods data", () => {
  const byName = (name: string): SeedFood => {
    const food = SEED_FOODS.find((item) => item.name === name);

    if (!food) {
      throw new Error(`missing seed food ${name}`);
    }
    return food;
  };

  it("has about 60 foods with unique names and a source each", () => {
    const keys = SEED_FOODS.map((food) => toNameKey(food.name));

    expect(SEED_FOODS.length).toBeGreaterThanOrEqual(55);
    expect(SEED_FOODS.length).toBeLessThanOrEqual(70);
    expect(new Set(keys).size).toBe(SEED_FOODS.length);
    expect(SEED_FOODS.every((food) => food.source.startsWith("USDA"))).toBe(
      true,
    );
  });

  it("covers every group the PT picks from except prepared dishes", () => {
    const groups = new Set(SEED_FOODS.map((food) => food.group));

    expect([...groups].sort()).toEqual([
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
    expect(byName("Bông cải xanh (luộc)")).toMatchObject({
      protein: 2.4,
      carbs: 7.2,
      fat: 0.4,
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
      expect(food.kcal).toBeGreaterThanOrEqual(0);
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
    for (const food of outliers) {
      expect(food.kcal).toBeLessThan(100);
      expect(food.fiber ?? 0).toBeGreaterThan(0);
    }
  });
});
