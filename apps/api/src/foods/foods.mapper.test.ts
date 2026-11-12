import { foodRequestSchema } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import type { FoodRow } from "./foods.mapper.js";
import { toFoodColumns, toFoodResponse } from "./foods.mapper.js";

const parse = (input: Record<string, unknown>) =>
  foodRequestSchema.parse({
    name: "Ức gà (chín)",
    group: "meat",
    state: "cooked",
    kcal: "165",
    protein: "31",
    carbs: "0",
    fat: "3.6",
    ...input,
  });

describe("toFoodColumns", () => {
  it("adds the accent-free key, drops the checkbox and nulls empty text", () => {
    expect(toFoodColumns(parse({ source: "USDA FDC 171477" }))).toEqual({
      name: "Ức gà (chín)",
      nameKey: "uc ga (chin)",
      group: "meat",
      state: "cooked",
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: null,
      servingLabel: null,
      servingGrams: null,
      nameEn: null,
      nameZh: null,
      source: "USDA FDC 171477",
    });
  });

  it("keeps serving and translations when given, collapsing spaces", () => {
    const columns = toFoodColumns(
      parse({
        name: "  Phở   bò ",
        group: "dish",
        state: "",
        servingLabel: " 1  tô ",
        servingGrams: "500",
        nameEn: "Beef pho",
        confirmed: "on",
        kcal: "100",
      }),
    );

    expect(columns).toMatchObject({
      name: "Phở bò",
      nameKey: "pho bo",
      state: null,
      servingLabel: "1 tô",
      servingGrams: 500,
      nameEn: "Beef pho",
      nameZh: null,
    });
    expect(columns).not.toHaveProperty("confirmed");
  });
});

describe("toFoodResponse", () => {
  it("returns only the public fields", () => {
    const row = {
      id: 3,
      name: "Táo",
      nameKey: "tao",
      nameEn: null,
      nameZh: null,
      group: "fruit",
      state: null,
      kcal: 52,
      protein: 0.3,
      carbs: 14,
      fat: 0.2,
      fiber: 2.4,
      servingLabel: null,
      servingGrams: null,
      source: "",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FoodRow;

    const response = toFoodResponse(row);

    expect(Object.keys(response).sort()).toEqual(
      [
        "id",
        "name",
        "nameKey",
        "nameEn",
        "nameZh",
        "group",
        "state",
        "kcal",
        "protein",
        "carbs",
        "fat",
        "fiber",
        "servingLabel",
        "servingGrams",
        "source",
      ].sort(),
    );
    expect(response.fiber).toBe(2.4);
  });
});
