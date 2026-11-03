// Collapsed meal cards are tracked as a list of meal ids (D6: page state only).

export const toggleMealCollapsed = (
  collapsed: number[],
  mealId: number,
): number[] =>
  collapsed.includes(mealId)
    ? collapsed.filter((id) => id !== mealId)
    : [...collapsed, mealId];

// True only when the day has meals and every one of them is collapsed; ids of
// deleted meals do not count.
export const areAllMealsCollapsed = (
  collapsed: number[],
  mealIds: number[],
): boolean =>
  mealIds.length > 0 && mealIds.every((id) => collapsed.includes(id));

// Drops ids of meals that no longer exist.
export const pruneCollapsedMeals = (
  collapsed: number[],
  mealIds: number[],
): number[] => collapsed.filter((id) => mealIds.includes(id));
