import type { z } from "zod";

// First message per field, keyed by the top-level field name.
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
