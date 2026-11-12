"use client";

import { useState } from "react";

import { formatGrams } from "@/features/foods/utils/food-math";
import { normalizeGrams } from "@/features/meal-plans/utils/grams-input";

// An amount the PT types: saved when the field loses focus and the value is a
// valid number above 0 (KAN-92: remove the food instead) that differs from the saved one (compared at the one decimal
// the server stores); the field then shows the value that will be stored.
export const useGramsInput = (
  savedGrams: number,
  save: (grams: number) => void,
) => {
  const [text, setText] = useState(formatGrams(savedGrams));

  const handleBlur = () => {
    const grams = normalizeGrams(text);

    if (grams === null || grams <= 0) {
      setText(formatGrams(savedGrams));
      return;
    }
    setText(formatGrams(grams));
    if (grams !== savedGrams) {
      save(grams);
    }
  };

  return { text, setText, handleBlur };
};
