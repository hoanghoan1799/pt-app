"use server";

import { z } from "zod";

import { USER_PASSWORD_MAX, USER_PASSWORD_MIN } from "@/constants/password";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import { withFormErrorHandling } from "@/services/action-errors";
import { requireUser } from "@/services/auth-guard";
import { hashPassword, verifyPassword } from "@/services/password";
import { startUserSession } from "@/services/session";
import { setUserPassword } from "@/services/users";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  toFieldErrors,
} from "@/utils/form";

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
    const user = await requireUser();
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

    // A legacy trainee without a password cannot be here via email login, but
    // never treat a missing hash as a match.
    const isCurrentCorrect = user.passwordHash
      ? await verifyPassword(parsed.data.currentPassword, user.passwordHash)
      : false;

    if (!isCurrentCorrect) {
      return createErrorState(AUTH_MESSAGES.CURRENT_PASSWORD_WRONG, {
        fieldErrors: { currentPassword: AUTH_MESSAGES.CURRENT_PASSWORD_WRONG },
      });
    }

    await setUserPassword(user.id, await hashPassword(parsed.data.newPassword));
    // Other devices are signed out by the staleness check; this one gets a
    // fresh session (same second as password_changed_at is still valid).
    await startUserSession(user.id);

    return createSuccessState(AUTH_MESSAGES.PASSWORD_CHANGED);
  },
);
