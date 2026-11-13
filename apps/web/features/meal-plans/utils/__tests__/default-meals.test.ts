import { describe, expect, it } from "vitest";

import { resolveMealCount } from "@/features/meal-plans/utils/default-meals";

// Naming the default meals (sáng, trưa, tối, Bữa phụ 1, 2...) is the API's now
// (apps/api/src/nutrition/rules/default-meals.test.ts).
describe("default meals", () => {
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
