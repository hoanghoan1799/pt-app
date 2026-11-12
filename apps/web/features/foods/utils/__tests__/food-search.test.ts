import { toNameKey } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import type { Food } from "@/features/foods/types/food";
import { filterFoods } from "@/features/foods/utils/food-search";

const FOODS: Pick<Food, "name" | "nameKey" | "group">[] = [
  { name: "Ức gà (chín)", nameKey: toNameKey("Ức gà (chín)"), group: "meat" },
  { name: "Ức gà (sống)", nameKey: toNameKey("Ức gà (sống)"), group: "meat" },
  { name: "Đậu hũ", nameKey: toNameKey("Đậu hũ"), group: "legume_nut" },
  {
    name: "Cá hồi (chín)",
    nameKey: toNameKey("Cá hồi (chín)"),
    group: "seafood",
  },
  { name: "Phở bò", nameKey: toNameKey("Phở bò"), group: "dish" },
];

const names = (
  query: string,
  group: Parameters<typeof filterFoods>[1]["group"] = "all",
) => filterFoods(FOODS, { query, group }).map((food) => food.name);

describe("F11 filterFoods", () => {
  it('finds "Ức gà (chín)" when typing "uc ga" without accents', () => {
    expect(names("uc ga")).toEqual(["Ức gà (chín)", "Ức gà (sống)"]);
  });

  it("ignores case, extra spaces and Vietnamese đ", () => {
    expect(names("  UC   GA CHIN ")).toEqual(["Ức gà (chín)"]);
    expect(names("dau hu")).toEqual(["Đậu hũ"]);
  });

  it("matches words in any order", () => {
    expect(names("chin ca")).toEqual(["Cá hồi (chín)"]);
  });

  it("returns every food for an empty query", () => {
    expect(names("")).toHaveLength(5);
  });

  it("finds nothing for text that is not a name", () => {
    expect(names("pizza")).toEqual([]);
  });

  it("narrows the list to one group", () => {
    expect(names("", "meat")).toEqual(["Ức gà (chín)", "Ức gà (sống)"]);
    expect(names("", "dish")).toEqual(["Phở bò"]);
  });

  it("combines the query with the group", () => {
    expect(names("chin", "meat")).toEqual(["Ức gà (chín)"]);
    expect(names("chin", "dish")).toEqual([]);
  });
});
