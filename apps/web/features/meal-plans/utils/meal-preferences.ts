// The meal request card starts open only while the trainee has not entered
// anything yet; once a meal count or a food note is saved it starts collapsed.
export const hasMealPreferences = (
  preferredMealCount: number | null,
  foodNote: string | null,
): boolean => preferredMealCount != null || Boolean(foodNote?.trim());
