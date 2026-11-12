"use client";

import { useState } from "react";

import {
  areAllMealsCollapsed,
  pruneCollapsedMeals,
  toggleMealCollapsed,
} from "@/features/meal-plans/utils/meal-collapse";

// Which meal cards of the day are folded. Page state only: every visit starts
// all open, a new meal starts open, and deleted meals drop out.
export const useMealCollapse = (mealIds: number[]) => {
  const [stored, setStored] = useState<number[]>([]);
  // Derived during render so a deleted meal never lingers.
  const collapsed = pruneCollapsedMeals(stored, mealIds);

  return {
    isCollapsed: (mealId: number) => collapsed.includes(mealId),
    toggle: (mealId: number) =>
      setStored(toggleMealCollapsed(collapsed, mealId)),
    collapseAll: () => setStored(mealIds),
    expandAll: () => setStored([]),
    isAllCollapsed: areAllMealsCollapsed(collapsed, mealIds),
  };
};
