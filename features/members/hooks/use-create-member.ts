"use client";

import { useActionState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { createMemberAction } from "@/features/members/services/member-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useCreateMember = () => {
  const [state, formAction] = useActionState(
    createMemberAction,
    INITIAL_FORM_STATE,
  );

  useFormFeedback(state);

  return {
    formAction,
    errorMessage: state.status === "error" ? state.message : undefined,
    // Keep the typed name after an error; a success resets the form to empty.
    defaultName: state.status === "error" ? state.values?.name : "",
  };
};
