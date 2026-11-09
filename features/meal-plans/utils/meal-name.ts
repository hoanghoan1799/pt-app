import {
  BASE_MEAL_NAMES,
  SNACK_NAME_PREFIX,
} from "@/features/meal-plans/constants/meal-plans";

type MealNameKey = "breakfast" | "lunch" | "dinner" | "snack";

type Translate = (key: MealNameKey, values?: { n: number }) => string;

const BASE_KEYS = ["breakfast", "lunch", "dinner"] as const;

const SNACK_PATTERN = new RegExp(`^${SNACK_NAME_PREFIX} (\\d+)$`);

// The stored default names ("Bữa sáng", "Bữa phụ 2") are shown in the user's
// language; a name the PT typed passes through. `t` is the translator of the
// mealPlans.mealNames namespace. Stored data is never changed.
export const localizeMealName = (name: string, t: Translate) => {
  const baseIndex = (BASE_MEAL_NAMES as readonly string[]).indexOf(name);

  if (baseIndex >= 0) {
    return t(BASE_KEYS[baseIndex]);
  }

  const snack = SNACK_PATTERN.exec(name);

  return snack ? t("snack", { n: Number(snack[1]) }) : name;
};
