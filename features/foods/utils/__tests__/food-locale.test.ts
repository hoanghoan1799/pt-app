import { describe, expect, it } from "vitest";

import { SEED_FOOD_TRANSLATIONS } from "@/features/foods/constants/food-translations";
import { SEED_FOODS } from "@/features/foods/constants/seed-foods";
import {
  localizeFood,
  localizeFoodName,
  localizeFoods,
  localizeServingLabel,
} from "@/features/foods/utils/food-locale";
import { filterFoods } from "@/features/foods/utils/food-search";
import { toNameKey } from "@/utils/name";

const chicken = {
  name: "Ức gà (chín)",
  nameKey: toNameKey("Ức gà (chín)"),
  nameEn: null,
  nameZh: null,
};

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
    expect(SEED_FOOD_TRANSLATIONS[chicken.nameKey]).toEqual({
      en: "Chicken breast (cooked)",
      zh: "鸡胸肉（熟）",
    });
  });
});

describe("localizeFoodName", () => {
  it("keeps the stored name in Vietnamese", () => {
    expect(localizeFoodName({ ...chicken, nameEn: "Hen breast" }, "vi")).toBe(
      "Ức gà (chín)",
    );
  });

  it("prefers the stored column over the seed map", () => {
    expect(localizeFoodName({ ...chicken, nameEn: "Hen breast" }, "en")).toBe(
      "Hen breast",
    );
    expect(localizeFoodName({ ...chicken, nameZh: "母鸡胸" }, "zh")).toBe(
      "母鸡胸",
    );
  });

  it("uses the seed map when the column is empty", () => {
    expect(localizeFoodName(chicken, "en")).toBe("Chicken breast (cooked)");
    expect(localizeFoodName({ ...chicken, nameZh: "  " }, "zh")).toBe(
      "鸡胸肉（熟）",
    );
  });

  it("falls back to the stored name for a food without translation", () => {
    const pho = { name: "Phở bò", nameKey: "pho bo" };

    expect(localizeFoodName(pho, "en")).toBe("Phở bò");
    expect(localizeFoodName(pho, "zh")).toBe("Phở bò");
  });
});

describe("localizeServingLabel", () => {
  it("translates common units to English with plural", () => {
    expect(localizeServingLabel("1 quả", "en")).toBe("1 piece");
    expect(localizeServingLabel("2 quả", "en")).toBe("2 pieces");
    expect(localizeServingLabel("1 ly", "en")).toBe("1 glass");
    expect(localizeServingLabel("1 chén", "en")).toBe("1 bowl");
    expect(localizeServingLabel("1 thìa", "en")).toBe("1 tbsp");
    expect(localizeServingLabel("3 thìa", "en")).toBe("3 tbsp");
    expect(localizeServingLabel("1 lon", "en")).toBe("1 can");
    expect(localizeServingLabel("1 tô", "en")).toBe("1 large bowl");
  });

  it("translates to Chinese without a space", () => {
    expect(localizeServingLabel("1 quả", "zh")).toBe("1个");
    expect(localizeServingLabel("1 ly", "zh")).toBe("1杯");
    expect(localizeServingLabel("2 chén", "zh")).toBe("2碗");
    expect(localizeServingLabel("1 lon", "zh")).toBe("1罐");
  });

  it("handles decimals", () => {
    expect(localizeServingLabel("0,5 ly", "en")).toBe("0,5 glass");
    expect(localizeServingLabel("1.5 lát", "en")).toBe("1.5 slices");
    expect(localizeServingLabel("1.5 lát", "zh")).toBe("1.5片");
  });

  it("passes unknown text and Vietnamese through unchanged", () => {
    expect(localizeServingLabel("1 tô lớn", "en")).toBe("1 tô lớn");
    expect(localizeServingLabel("một nắm tay", "zh")).toBe("một nắm tay");
    expect(localizeServingLabel("1 xyz", "en")).toBe("1 xyz");
    expect(localizeServingLabel("1 quả", "vi")).toBe("1 quả");
  });
});

describe("localizeFood and search", () => {
  const foods = [
    { ...chicken, id: 1, group: "meat" as const, servingLabel: null },
    {
      name: "Chuối",
      nameKey: "chuoi",
      nameEn: null,
      nameZh: null,
      id: 2,
      group: "fruit" as const,
      servingLabel: "1 quả",
    },
  ];

  it("localizes name and serving and builds a search key", () => {
    const [chickenZh, bananaEn] = [
      localizeFood(foods[0], "zh"),
      localizeFood(foods[1], "en"),
    ];

    expect(chickenZh.name).toBe("鸡胸肉（熟）");
    expect(chickenZh.searchKey).toBe("uc ga (chin) 鸡胸肉（熟）");
    expect(bananaEn.name).toBe("Banana");
    expect(bananaEn.servingLabel).toBe("1 piece");
    expect(bananaEn.searchKey).toBe("chuoi banana");
  });

  it("keeps the CJK characters in toNameKey", () => {
    expect(toNameKey("鸡胸肉（熟）")).toBe("鸡胸肉（熟）");
  });

  it("filterFoods finds a food by its Chinese and English name", () => {
    const zh = localizeFoods(foods, "zh");
    const en = localizeFoods(foods, "en");
    const find = (list: typeof zh, query: string) =>
      filterFoods(list, { query, group: "all" }).map((food) => food.id);

    expect(find(zh, "鸡胸")).toEqual([1]);
    expect(find(zh, "香蕉")).toEqual([2]);
    expect(find(en, "chicken")).toEqual([1]);
    expect(find(en, "BANANA")).toEqual([2]);
    // The Vietnamese text still works in every language.
    expect(find(en, "uc ga")).toEqual([1]);
  });

  it("sorts by the localized name", () => {
    expect(localizeFoods(foods, "en").map((food) => food.name)).toEqual([
      "Banana",
      "Chicken breast (cooked)",
    ]);
  });
});
