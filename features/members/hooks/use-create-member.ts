"use client";

import { useActionState, useState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { createMemberAction } from "@/features/members/services/member-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useCreateMember = (onDone?: () => void) => {
  const [state, formAction] = useActionState(
    createMemberAction,
    INITIAL_FORM_STATE,
  );
  // The submit time of the response whose password the admin has dismissed.
  const [dismissedAt, setDismissedAt] = useState<number>();

  useFormFeedback(state);

  const isPasswordShown =
    state.credentials !== undefined && state.submittedAt !== dismissedAt;

  const dismissPassword = () => {
    setDismissedAt(state.submittedAt);
    onDone?.();
  };

  return {
    formAction,
    errorMessage: state.status === "error" ? state.message : undefined,
    nameError: state.fieldErrors?.name,
    emailError: state.fieldErrors?.email,
    // Keep what was typed after an error; a success resets the form to empty.
    defaultName: state.status === "error" ? state.values?.name : "",
    defaultEmail: state.status === "error" ? state.values?.email : "",
    credentials: isPasswordShown ? state.credentials : undefined,
    dismissPassword,
  };
};
