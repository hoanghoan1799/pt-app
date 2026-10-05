"use client";

import { useActionState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { logWeightAction } from "@/features/nutrition/services/nutrition-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useWeightLogForm = () => {
  const [state, formAction] = useActionState(
    logWeightAction,
    INITIAL_FORM_STATE,
  );

  useFormFeedback(state);

  return {
    formAction,
    errorMessage:
      state.status === "error" ? state.fieldErrors?.weightKg : undefined,
  };
};
