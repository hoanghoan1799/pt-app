"use client";

import { useActionState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { saveNutritionTargetAction } from "@/features/nutrition/services/nutrition-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useTargetForm = (onSaved: () => void) => {
  const [state, formAction] = useActionState(
    saveNutritionTargetAction,
    INITIAL_FORM_STATE,
  );

  useFormFeedback(state, onSaved);

  return {
    formAction,
    fieldErrors: state.status === "error" ? (state.fieldErrors ?? {}) : {},
  };
};
