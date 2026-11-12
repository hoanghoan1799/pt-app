"use client";

import { FoodEntryFormView } from "@/features/nutrition/components/FoodEntryFormView";
import { useFoodEntryForm } from "@/features/nutrition/hooks/use-food-entry-form";
import type { FoodEntry, Meal } from "@/features/nutrition/types/nutrition";

interface FoodEntryFormProps {
  entry: FoodEntry | null;
  date: string;
  defaultMeal: Meal;
  onSaved: () => void;
}

export const FoodEntryForm = ({
  entry,
  date,
  defaultMeal,
  onSaved,
}: FoodEntryFormProps) => {
  const form = useFoodEntryForm({ entry, defaultMeal, onSaved });

  return (
    <FoodEntryFormView
      entry={entry}
      date={date}
      meal={form.meal}
      isPending={form.isPending}
      fieldErrors={form.fieldErrors}
      formError={form.formError}
      onMealChange={form.setMeal}
      onSubmit={form.handleSubmit}
    />
  );
};
