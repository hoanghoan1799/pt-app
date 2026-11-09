"use client";

import { useTranslations } from "next-intl";

import { localizeMealName } from "@/features/meal-plans/utils/meal-name";

// Returns a function that shows a stored meal name in the active language.
export const useMealName = () => {
  const t = useTranslations("mealPlans.mealNames");

  return (name: string) => localizeMealName(name, t);
};
