import { describe, expect, it } from "vitest";

import {
  areAllMealsCollapsed,
  pruneCollapsedMeals,
  toggleMealCollapsed,
} from "@/features/meal-plans/utils/meal-collapse";

describe("toggleMealCollapsed", () => {
  it("adds an id that is open, then removes it again", () => {
    const collapsed = toggleMealCollapsed([], 2);

    expect(collapsed).toEqual([2]);
    expect(toggleMealCollapsed(collapsed, 2)).toEqual([]);
  });

  it("leaves the other ids alone and does not mutate the input", () => {
    const collapsed = [1, 3];

    expect(toggleMealCollapsed(collapsed, 2)).toEqual([1, 3, 2]);
    expect(toggleMealCollapsed(collapsed, 1)).toEqual([3]);
    expect(collapsed).toEqual([1, 3]);
  });
});

describe("areAllMealsCollapsed", () => {
  it("is true when every meal is collapsed", () => {
    expect(areAllMealsCollapsed([1, 2], [1, 2])).toBe(true);
  });

  it("is false when one meal is still open", () => {
    expect(areAllMealsCollapsed([1], [1, 2])).toBe(false);
  });

  it("ignores the stale id of a deleted meal", () => {
    expect(areAllMealsCollapsed([1, 9], [1, 2])).toBe(false);
    expect(areAllMealsCollapsed([1, 2, 9], [1, 2])).toBe(true);
  });

  it("is false when the day has no meals", () => {
    expect(areAllMealsCollapsed([], [])).toBe(false);
    expect(areAllMealsCollapsed([4], [])).toBe(false);
  });
});

describe("pruneCollapsedMeals", () => {
  it("drops ids of meals that no longer exist", () => {
    expect(pruneCollapsedMeals([1, 9, 2], [1, 2, 3])).toEqual([1, 2]);
  });

  it("returns an empty list when no meal is left", () => {
    expect(pruneCollapsedMeals([1, 2], [])).toEqual([]);
  });
});
