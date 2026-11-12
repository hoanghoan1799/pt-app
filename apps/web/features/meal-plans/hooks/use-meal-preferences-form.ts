"use client";

import { useActionState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { saveMealPreferencesAction } from "@/features/meal-plans/services/meal-preferences-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useMealPreferencesForm = () => {
  const [state, formAction] = useActionState(
    saveMealPreferencesAction,
    INITIAL_FORM_STATE,
  );

  useFormFeedback(state);

  return {
    formAction,
    fieldErrors: state.status === "error" ? (state.fieldErrors ?? {}) : {},
    values: state.status === "error" ? state.values : undefined,
  };
};
