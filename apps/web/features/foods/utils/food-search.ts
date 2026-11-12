import { toNameKey } from "@pt/contracts";

import type { Food, FoodGroup } from "@/features/foods/types/food";

export type FoodGroupFilter = FoodGroup | "all";

interface FoodFilter {
  query: string;
  group: FoodGroupFilter;
}

// Accent- and case-insensitive: "uc ga" finds "Ức gà (chín)". Every word of
// the query must appear in the name, in any order. A localized food carries a
// `searchKey` (Vietnamese plus its English/Chinese name) that is matched first.
export const filterFoods = <
  T extends Pick<Food, "nameKey" | "group"> & { searchKey?: string },
>(
  foods: T[],
  { query, group }: FoodFilter,
): T[] => {
  const words = toNameKey(query).split(" ").filter(Boolean);

  return foods.filter((food) => {
    if (group !== "all" && food.group !== group) {
      return false;
    }
    return words.every((word) =>
      (food.searchKey ?? food.nameKey).includes(word),
    );
  });
};
