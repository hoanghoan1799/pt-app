import { describe, expect, it } from "vitest";

import { normalizeGrams } from "@/features/meal-plans/utils/grams-input";

describe("normalizeGrams", () => {
  it("rounds to one decimal like the server stores it", () => {
    expect(normalizeGrams("212,46")).toBe(212.5);
    expect(normalizeGrams("100.04")).toBe(100);
    expect(normalizeGrams("0")).toBe(0);
  });

  it("refuses text, negatives and more than 3000 g", () => {
    expect(normalizeGrams("abc")).toBeNull();
    expect(normalizeGrams("")).toBeNull();
    expect(normalizeGrams("-5")).toBeNull();
    expect(normalizeGrams("3000,04")).toBe(3000);
    expect(normalizeGrams("3000,1")).toBeNull();
  });
});
