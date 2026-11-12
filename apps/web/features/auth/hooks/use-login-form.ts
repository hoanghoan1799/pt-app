"use client";

import { useActionState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import type { FormState } from "@/types/form";

type LoginAction = (state: FormState, formData: FormData) => Promise<FormState>;

export const useLoginForm = (action: LoginAction) => {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);

  return {
    formAction,
    errorMessage: state.status === "error" ? state.message : undefined,
    errorReference: state.status === "error" ? state.errorReference : undefined,
    values: state.values ?? {},
  };
};
