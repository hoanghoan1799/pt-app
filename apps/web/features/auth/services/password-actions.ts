"use server";

import { toFieldErrors } from "@pt/contracts";
import { z } from "zod";

import { USER_PASSWORD_MAX, USER_PASSWORD_MIN } from "@/constants/password";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import { withFormErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
import { requireUser } from "@/services/auth-guard";
import type { FormState } from "@/types/form";
import { createErrorState, createSuccessState } from "@/utils/form";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, AUTH_MESSAGES.CURRENT_PASSWORD_REQUIRED),
    newPassword: z
      .string()
      .min(USER_PASSWORD_MIN, AUTH_MESSAGES.NEW_PASSWORD_TOO_SHORT)
      .max(USER_PASSWORD_MAX, AUTH_MESSAGES.NEW_PASSWORD_TOO_LONG),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: AUTH_MESSAGES.CONFIRM_MISMATCH,
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: AUTH_MESSAGES.NEW_PASSWORD_SAME,
  });

export const changePasswordAction = withFormErrorHandling(
  "changePassword",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireUser();
    const parsed = changePasswordSchema.safeParse({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });

    if (!parsed.success) {
      return createErrorState(parsed.error.issues[0].message, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    // The API checks the current password and signs out every other device;
    // this session stays valid, so the cookie does not change.
    const outcome = await tryApi("user", (api) =>
      api.POST("/v1/users/me/password", {
        body: {
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
        },
      }),
    );

    if (!outcome.ok) {
      return outcome.error.code === "CURRENT_PASSWORD_WRONG"
        ? createErrorState(outcome.error.message, {
            fieldErrors: { currentPassword: outcome.error.message },
          })
        : apiErrorToFormState(outcome.error);
    }
    return createSuccessState(AUTH_MESSAGES.PASSWORD_CHANGED);
  },
);
