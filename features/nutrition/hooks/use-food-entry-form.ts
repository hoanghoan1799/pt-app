"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { saveFoodEntryAction } from "@/features/nutrition/services/nutrition-actions";
import type { FoodEntry, Meal } from "@/features/nutrition/types/nutrition";
import { useFormFeedback } from "@/hooks/use-form-feedback";

interface UseFoodEntryFormOptions {
  entry: FoodEntry | null;
  defaultMeal: Meal;
  onSaved: () => void;
}

export const useFoodEntryForm = ({
  entry,
  defaultMeal,
  onSaved,
}: UseFoodEntryFormOptions) => {
  const [state, formAction, isPending] = useActionState(
    saveFoodEntryAction,
    INITIAL_FORM_STATE,
  );
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? defaultMeal);

  useFormFeedback(state, onSaved);

  // Submitted through a transition so React doesn't reset the fields when
  // the server returns validation errors.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(() => formAction(formData));
  };

  return {
    meal,
    setMeal,
    isPending,
    fieldErrors: state.status === "error" ? (state.fieldErrors ?? {}) : {},
    formError:
      state.status === "error" && !state.fieldErrors
        ? state.message
        : undefined,
    handleSubmit,
  };
};
