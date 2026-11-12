"use client";

import { FOOD_GROUP_VALUES } from "@pt/contracts";
import { useState } from "react";

import type { Food } from "@/features/foods/types/food";
import {
  filterFoods,
  type FoodGroupFilter,
} from "@/features/foods/utils/food-search";

export const useFoodFilter = (foods: Food[]) => {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<FoodGroupFilter>("all");

  // Only groups that have a food get a chip.
  const groupsInUse = FOOD_GROUP_VALUES.filter((item) =>
    foods.some((food) => food.group === item),
  );
  // A chip whose last food was just removed must not leave an empty list.
  const activeGroup =
    group === "all" || groupsInUse.includes(group) ? group : "all";

  return {
    query,
    setQuery,
    group: activeGroup,
    setGroup,
    groupsInUse,
    filteredFoods: filterFoods(foods, { query, group: activeGroup }),
  };
};
