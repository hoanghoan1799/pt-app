import { describe, expect, it } from "vitest";

import { hasMealPreferences } from "@/features/meal-plans/utils/meal-preferences";

describe("hasMealPreferences", () => {
  it("is false when neither a meal count nor a note is saved", () => {
    expect(hasMealPreferences(null, null)).toBe(false);
  });

  it("is false when the note is only whitespace", () => {
    expect(hasMealPreferences(null, "   \n")).toBe(false);
  });

  it("is true when only a meal count is saved", () => {
    expect(hasMealPreferences(3, null)).toBe(true);
  });

  it("is true when only a food note is saved", () => {
    expect(hasMealPreferences(null, "Không ăn hải sản")).toBe(true);
  });
});
