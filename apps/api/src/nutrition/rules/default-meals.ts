import { MEAL_COUNT_LIMITS } from "@pt/contracts";

// Q3: the first three meals, then "Bữa phụ 1, 2...".
const BASE_MEAL_NAMES = ["Bữa sáng", "Bữa trưa", "Bữa tối"] as const;
const SNACK_NAME_PREFIX = "Bữa phụ";

// The name of a new meal: the first of Bữa sáng / trưa / tối not used yet,
// then "Bữa phụ 1", "Bữa phụ 2"... (Q3).
export const getNextMealName = (existing: string[]) => {
  const used = new Set(existing);
  const base = BASE_MEAL_NAMES.find((name) => !used.has(name));

  if (base) {
    return base;
  }

  let index = 1;

  while (used.has(`${SNACK_NAME_PREFIX} ${index}`)) {
    index += 1;
  }
  return `${SNACK_NAME_PREFIX} ${index}`;
};

export const getDefaultMealNames = (count: number) => {
  const names: string[] = [];

  for (let index = 0; index < count; index += 1) {
    names.push(getNextMealName(names));
  }
  return names;
};

// The trainee's request when it is a valid count, else 3 (Q2).
export const resolveMealCount = (preferred: number | null | undefined) =>
  typeof preferred === "number" &&
  Number.isInteger(preferred) &&
  preferred >= MEAL_COUNT_LIMITS.min &&
  preferred <= MEAL_COUNT_LIMITS.max
    ? preferred
    : MEAL_COUNT_LIMITS.fallback;
