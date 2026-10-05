"use client";

import { useActionState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { saveDayAction } from "@/features/workouts/services/workout-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useDayInfoForm = (onSaved: () => void) => {
  const [state, formAction] = useActionState(saveDayAction, INITIAL_FORM_STATE);

  useFormFeedback(state, onSaved);

  return {
    formAction,
    fieldErrors: state.status === "error" ? (state.fieldErrors ?? {}) : {},
  };
};
