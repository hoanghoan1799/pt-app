import { describe, expect, it } from "vitest";

import { localizeMealName } from "@/features/meal-plans/utils/meal-name";
import enMessages from "@/messages/en/mealPlans.json";
import zhMessages from "@/messages/zh/mealPlans.json";

const translator =
  (names: Record<string, string>) => (key: string, values?: { n: number }) =>
    names[key].replace("{n}", String(values?.n ?? ""));

const en = translator(enMessages.mealNames);
const zh = translator(zhMessages.mealNames);

describe("localizeMealName", () => {
  it("translates the default meal names", () => {
    expect(localizeMealName("Bữa sáng", en)).toBe("Breakfast");
    expect(localizeMealName("Bữa trưa", en)).toBe("Lunch");
    expect(localizeMealName("Bữa tối", zh)).toBe("晚餐");
    expect(localizeMealName("Bữa sáng", zh)).toBe("早餐");
  });

  it("translates snacks with their number", () => {
    expect(localizeMealName("Bữa phụ 1", en)).toBe("Snack 1");
    expect(localizeMealName("Bữa phụ 12", zh)).toBe("加餐 12");
  });

  it("passes custom names through", () => {
    expect(localizeMealName("Sau tập", en)).toBe("Sau tập");
    expect(localizeMealName("Bữa phụ chiều", zh)).toBe("Bữa phụ chiều");
    expect(localizeMealName("Bữa phụ", en)).toBe("Bữa phụ");
  });
});
