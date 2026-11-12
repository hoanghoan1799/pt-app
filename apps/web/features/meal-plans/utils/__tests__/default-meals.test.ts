import { describe, expect, it } from "vitest";

import {
  getDefaultMealNames,
  getNextMealName,
  resolveMealCount,
} from "@/features/meal-plans/utils/default-meals";

describe("default meals", () => {
  it("names the first meals sáng, trưa, tối, then Bữa phụ 1, 2", () => {
    expect(getDefaultMealNames(5)).toEqual([
      "Bữa sáng",
      "Bữa trưa",
      "Bữa tối",
      "Bữa phụ 1",
      "Bữa phụ 2",
    ]);
    expect(getDefaultMealNames(2)).toEqual(["Bữa sáng", "Bữa trưa"]);
  });

  it("names an added meal after the ones that exist", () => {
    expect(getNextMealName(["Bữa sáng", "Bữa tối"])).toBe("Bữa trưa");
    expect(getNextMealName(["Bữa sáng", "Bữa trưa", "Bữa tối"])).toBe(
      "Bữa phụ 1",
    );
    expect(
      getNextMealName(["Bữa sáng", "Bữa trưa", "Bữa tối", "Bữa phụ 1"]),
    ).toBe("Bữa phụ 2");
    // A renamed meal frees its default name.
    expect(getNextMealName(["Pre-workout", "Bữa trưa", "Bữa tối"])).toBe(
      "Bữa sáng",
    );
  });

  it("uses the trainee's count when valid, else 3", () => {
    expect(resolveMealCount(4)).toBe(4);
    expect(resolveMealCount(2)).toBe(2);
    expect(resolveMealCount(6)).toBe(6);
    expect(resolveMealCount(null)).toBe(3);
    expect(resolveMealCount(undefined)).toBe(3);
    expect(resolveMealCount(1)).toBe(3);
    expect(resolveMealCount(7)).toBe(3);
    expect(resolveMealCount(3.5)).toBe(3);
  });
});
