// Per-day meal-plan completion (KAN-119, decision 3): how many of the planned
// meals the trainee marked eaten ("Đạt"). Extra food and note-only marks do
// not count.
export type DayCompletion = "complete" | "partial" | "none";

// `plannedMealIds`: the meals of the day's plan (empty = no plan or a plan
// without meals). `markedMealIds`: meals with an "achieved" mark; ids that are
// not planned meals of the day (orphan marks) and repeats are ignored.
export const getDayCompletion = (
  plannedMealIds: readonly number[],
  markedMealIds: readonly number[],
): DayCompletion => {
  const planned = new Set(plannedMealIds);

  if (!planned.size) {
    return "none";
  }

  const marked = new Set(markedMealIds.filter((id) => planned.has(id)));

  if (!marked.size) {
    return "none";
  }

  return marked.size === planned.size ? "complete" : "partial";
};

// Status for every date of `dates`; a date without a plan day is "none".
export const buildWeekCompletion = (
  dates: readonly string[],
  mealIdsByDate: ReadonlyMap<string, readonly number[]>,
  markedMealIds: readonly number[],
): Record<string, DayCompletion> =>
  Object.fromEntries(
    dates.map((date) => [
      date,
      getDayCompletion(mealIdsByDate.get(date) ?? [], markedMealIds),
    ]),
  );
