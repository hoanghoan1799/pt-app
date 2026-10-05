import type { z } from "zod";

import type { FormState } from "@/types/form";

export const toFieldErrors = (error: z.ZodError) => {
  const fieldErrors: Partial<Record<string, string>> = {};

  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");

    if (!fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
};

export const getFormValues = (formData: FormData) => {
  const values: Record<string, string> = {};

  formData.forEach((value, key) => {
    if (typeof value === "string") {
      values[key] = value;
    }
  });
  return values;
};

export const createErrorState = (
  message: string,
  extra: Omit<FormState, "status" | "message"> = {},
): FormState => ({
  status: "error",
  message,
  submittedAt: Date.now(),
  ...extra,
});

export const createSuccessState = (message?: string): FormState => ({
  status: "success",
  message,
  submittedAt: Date.now(),
});
