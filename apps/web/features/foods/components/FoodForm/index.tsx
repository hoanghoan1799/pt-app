"use client";

import { FoodFormView } from "@/features/foods/components/FoodFormView";
import { useFoodForm } from "@/features/foods/hooks/use-food-form";
import type { Food } from "@/features/foods/types/food";

interface FoodFormProps {
  // The food being edited, or null to add a new one.
  food: Food | null;
}

export const FoodForm = ({ food }: FoodFormProps) => {
  const form = useFoodForm(food);

  return (
    <FoodFormView
      food={food}
      values={form.values}
      onNumberChange={{
        kcal: form.setKcal,
        protein: form.setProtein,
        carbs: form.setCarbs,
        fat: form.setFat,
      }}
      kcalCheck={form.kcalCheck}
      isConfirmed={form.isConfirmed}
      onConfirmedChange={form.setIsConfirmed}
      isPending={form.isPending}
      fieldErrors={form.fieldErrors}
      formError={form.formError}
      onSubmit={form.handleSubmit}
    />
  );
};
