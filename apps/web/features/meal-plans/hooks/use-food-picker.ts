"use client";

import { useState } from "react";

import { filterFoods } from "@/features/foods/utils/food-search";
import type { PlanFood } from "@/features/meal-plans/types/meal-plan";

const MAX_RESULTS = 8;

// Accent-free search over the library, minus foods already in the meal.
export const useFoodPicker = (library: PlanFood[], takenFoodIds: number[]) => {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const results = trimmed
    ? filterFoods(
        library.filter((food) => !takenFoodIds.includes(food.id)),
        { query: trimmed, group: "all" },
      )
    : [];

  return {
    query,
    setQuery,
    results: results.slice(0, MAX_RESULTS),
    hasMore: results.length > MAX_RESULTS,
    isSearching: trimmed.length > 0,
    clear: () => setQuery(""),
  };
};
