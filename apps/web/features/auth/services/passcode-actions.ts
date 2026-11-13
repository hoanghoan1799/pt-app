"use server";

import { z } from "zod";

import { ADMIN_COOKIE } from "@/constants/session";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import type {
  PasscodeFailure,
  PasscodeResult,
} from "@/features/auth/types/passcode";
import { passcodeSchema } from "@/features/auth/utils/passcode-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { type ApiOutcome, tryApi } from "@/services/api/call";
import type { ApiError } from "@/services/api/errors";
import { requireAdmin, requireAdminSession } from "@/services/auth-guard";
import { endSession } from "@/services/session";

// The passcode rules (hash, 5 wrong codes sign the admin out, unlock window,
// reset limiter, hidden-chat check) live in the API
// (apps/api/src/admins/admin-passcode.service.ts, covered by
// apps/api/test/passcode.e2e.test.ts). These actions validate the input shape,
// call the API and translate its answer for the UI.

const SUCCESS: PasscodeResult = { status: "success" };

const fail = (message: string): PasscodeFailure => ({
  status: "error",
  message,
});

const firstIssue = (error: z.ZodError) => error.issues[0].message;

// PASSCODE_WRONG carries `attemptsLeft`; the fifth wrong code ends the API
// session, so the cookie goes too and the client must show the login page.
const toFailure = async (error: ApiError): Promise<PasscodeFailure> => {
  if (error.code === "PASSCODE_SIGNED_OUT") {
    await endSession(ADMIN_COOKIE);
    return {
      status: "error",
      message: error.message,
      attemptsLeft: 0,
      signedOut: true,
    };
  }

  const attemptsLeft = error.details?.attemptsLeft;

  return typeof attemptsLeft === "number"
    ? { status: "error", message: error.message, attemptsLeft }
    : fail(error.message);
};

const toResult = async <Data>(outcome: ApiOutcome<Data>) =>
  outcome.ok ? SUCCESS : toFailure(outcome.error);

const setSchema = z.object({ passcode: passcodeSchema });
const changeSchema = z.object({
  currentPasscode: passcodeSchema,
  newPasscode: passcodeSchema,
});
const currentSchema = z.object({ currentPasscode: passcodeSchema });
const resetSchema = z.object({
  password: z.string().min(1, AUTH_MESSAGES.CREDENTIALS_REQUIRED),
  newPasscode: passcodeSchema,
});

// First passcode. Needs an unlocked session; with a passcode already set the
// admin must use changePasscode (the API answers 409).
export const setPasscode = withResultErrorHandling(
  "setPasscode",
  async (passcode: string): Promise<PasscodeResult> => {
    await requireAdmin();
    const parsed = setSchema.safeParse({ passcode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }
    return toResult(
      await tryApi("admin", (api) =>
        api.PUT("/v1/admins/me/passcode", {
          body: { passcode: parsed.data.passcode },
        }),
      ),
    );
  },
);

export const changePasscode = withResultErrorHandling(
  "changePasscode",
  async (
    currentPasscode: string,
    newPasscode: string,
  ): Promise<PasscodeResult> => {
    await requireAdmin();
    const parsed = changeSchema.safeParse({ currentPasscode, newPasscode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }
    if (parsed.data.currentPasscode === parsed.data.newPasscode) {
      return fail(AUTH_MESSAGES.PASSCODE_SAME);
    }
    return toResult(
      await tryApi("admin", (api) =>
        api.POST("/v1/admins/me/passcode/change", { body: parsed.data }),
      ),
    );
  },
);

// Refused by the API while chats are hidden (KAN-160, Q14).
export const turnOffPasscode = withResultErrorHandling(
  "turnOffPasscode",
  async (currentPasscode: string): Promise<PasscodeResult> => {
    await requireAdmin();
    const parsed = currentSchema.safeParse({ currentPasscode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }
    return toResult(
      await tryApi("admin", (api) =>
        api.DELETE("/v1/admins/me/passcode", { body: parsed.data }),
      ),
    );
  },
);

// The lock screen. Lock-exempt: a locked admin is exactly who calls this.
export const verifyPasscode = withResultErrorHandling(
  "verifyPasscode",
  async (passcode: string): Promise<PasscodeResult> => {
    await requireAdminSession();
    const parsed = currentSchema.safeParse({ currentPasscode: passcode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }
    return toResult(
      await tryApi("admin", (api) =>
        api.POST("/v1/admins/me/passcode/verify", {
          body: { passcode: parsed.data.currentPasscode },
        }),
      ),
    );
  },
);

// "Quên mã khoá": the account password proves it is the admin, then a new
// passcode replaces the old one. The API limits wrong passwords.
export const resetPasscodeWithPassword = withResultErrorHandling(
  "resetPasscodeWithPassword",
  async (password: string, newPasscode: string): Promise<PasscodeResult> => {
    await requireAdminSession();
    const parsed = resetSchema.safeParse({ password, newPasscode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }
    return toResult(
      await tryApi("admin", (api) =>
        api.POST("/v1/admins/me/passcode/reset", { body: parsed.data }),
      ),
    );
  },
);

// "Khoá ngay": ends the unlock at once, so every admin page and action sends
// the admin to the lock screen until the passcode is typed again. Without a
// passcode there is nothing to lock with (the API answers 400).
export const lockNow = withResultErrorHandling(
  "lockNow",
  async (): Promise<PasscodeResult> => {
    await requireAdminSession();
    return toResult(
      await tryApi("admin", (api) => api.POST("/v1/admins/me/passcode/lock")),
    );
  },
);
