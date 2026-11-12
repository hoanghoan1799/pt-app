import { MEAL_COUNT_LIMITS } from "@pt/contracts";

// The trainee's request when it is a valid count, else 3 (Q2).
export const resolveMealCount = (preferred: number | null | undefined) =>
  typeof preferred === "number" &&
  Number.isInteger(preferred) &&
  preferred >= MEAL_COUNT_LIMITS.min &&
  preferred <= MEAL_COUNT_LIMITS.max
    ? preferred
    : MEAL_COUNT_LIMITS.fallback;
