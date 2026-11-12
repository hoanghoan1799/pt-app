"use client";

import { FOOD_LIMITS } from "@pt/contracts";
import { parseDecimal } from "@pt/contracts";
import { useState } from "react";

import type { Food } from "@/features/foods/types/food";
import { scaleFood, servingsToGrams } from "@/features/foods/utils/food-math";

export type AmountUnit = "grams" | "servings";

const DEFAULT_AMOUNT: Record<AmountUnit, string> = {
  grams: "100",
  servings: "1",
};

export const useFoodAmount = (
  food: Pick<Food, "kcal" | "protein" | "carbs" | "fat" | "servingGrams">,
) => {
  const [unit, setUnit] = useState<AmountUnit>("grams");
  const [text, setText] = useState(DEFAULT_AMOUNT.grams);

  const servingGrams = unit === "servings" ? food.servingGrams : null;
  // The typed number is what gets validated, in the unit it is typed in.
  const amount = parseDecimal(text);
  const maxAmount = servingGrams
    ? Math.floor(FOOD_LIMITS.MAX_AMOUNT_GRAMS / servingGrams)
    : FOOD_LIMITS.MAX_AMOUNT_GRAMS;
  const isValid = Number.isFinite(amount) && amount >= 0 && amount <= maxAmount;
  const grams = servingGrams ? servingsToGrams(amount, servingGrams) : amount;

  const changeUnit = (next: AmountUnit) => {
    setUnit(next);
    setText(DEFAULT_AMOUNT[next]);
  };

  return {
    unit,
    changeUnit,
    text,
    setText,
    isValid,
    maxAmount,
    // An invalid amount shows zeros and a hint instead of wrong numbers.
    result: scaleFood(food, isValid ? grams : 0),
  };
};
