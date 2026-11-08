"use server";

import { z } from "zod";

import { ADMIN_COOKIE } from "@/constants/session";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import type {
  PasscodeFailure,
  PasscodeResult,
} from "@/features/auth/types/passcode";
import {
  attemptsLeft,
  passcodeSchema,
  shouldSignOut,
} from "@/features/auth/utils/passcode-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { clearReveal, clearUnlock, issueUnlock } from "@/services/admin-lock";
import {
  countHiddenUsers,
  findAdminSecrets,
  recordPasscodeFailure,
  resetPasscodeFailures,
  setAdminPasscodeHash,
} from "@/services/admins";
import { requireAdmin, requireAdminSession } from "@/services/auth-guard";
import {
  clearAttempts,
  isLocked,
  passcodeResetLimiterKey,
  recordFailure,
} from "@/services/login-limiter";
import { hashPassword, verifyPassword } from "@/services/password";
import { endSession } from "@/services/session";

const SUCCESS: PasscodeResult = { status: "success" };

const fail = (message: string): PasscodeFailure => ({
  status: "error",
  message,
});

const firstIssue = (error: z.ZodError) => error.issues[0].message;

// A wrong passcode counts toward the 5-strike sign-out wherever it is typed
// (lock screen, change, turn off), so an unlocked session cannot brute-force
// the code through the settings actions either.
const rejectWrongPasscode = async (
  adminId: number,
): Promise<PasscodeFailure> => {
  const failedCount = await recordPasscodeFailure(adminId);

  if (shouldSignOut(failedCount)) {
    await resetPasscodeFailures(adminId);
    await endSession(ADMIN_COOKIE);
    await clearUnlock();
    return {
      status: "error",
      message: AUTH_MESSAGES.PASSCODE_SIGNED_OUT,
      attemptsLeft: 0,
      signedOut: true,
    };
  }
  return {
    status: "error",
    message: AUTH_MESSAGES.PASSCODE_WRONG,
    attemptsLeft: attemptsLeft(failedCount),
  };
};

// Checks `candidate` against the stored hash. Null = correct (counter reset).
const checkCurrentPasscode = async (
  adminId: number,
  candidate: string,
): Promise<PasscodeFailure | null> => {
  const secrets = await findAdminSecrets(adminId);

  if (!secrets?.passcodeHash) {
    return fail(AUTH_MESSAGES.PASSCODE_NOT_SET);
  }
  if (!(await verifyPassword(candidate, secrets.passcodeHash))) {
    return rejectWrongPasscode(adminId);
  }
  await resetPasscodeFailures(adminId);
  return null;
};

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
// admin must use changePasscode.
export const setPasscode = withResultErrorHandling(
  "setPasscode",
  async (passcode: string): Promise<PasscodeResult> => {
    const admin = await requireAdmin();
    const parsed = setSchema.safeParse({ passcode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }
    if (admin.hasPasscode) {
      return fail(AUTH_MESSAGES.PASSCODE_ALREADY_SET);
    }
    await setAdminPasscodeHash(
      admin.id,
      await hashPassword(parsed.data.passcode),
    );
    // The admin just typed it: do not lock them out right away.
    await issueUnlock(admin.id);
    return SUCCESS;
  },
);

export const changePasscode = withResultErrorHandling(
  "changePasscode",
  async (
    currentPasscode: string,
    newPasscode: string,
  ): Promise<PasscodeResult> => {
    const admin = await requireAdmin();
    const parsed = changeSchema.safeParse({ currentPasscode, newPasscode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }
    if (parsed.data.currentPasscode === parsed.data.newPasscode) {
      return fail(AUTH_MESSAGES.PASSCODE_SAME);
    }

    const rejection = await checkCurrentPasscode(
      admin.id,
      parsed.data.currentPasscode,
    );

    if (rejection) {
      return rejection;
    }
    await setAdminPasscodeHash(
      admin.id,
      await hashPassword(parsed.data.newPasscode),
    );
    await issueUnlock(admin.id);
    return SUCCESS;
  },
);

// Refused while chats are hidden: they would become visible to anyone with
// the open app (KAN-160, Q14).
export const turnOffPasscode = withResultErrorHandling(
  "turnOffPasscode",
  async (currentPasscode: string): Promise<PasscodeResult> => {
    const admin = await requireAdmin();
    const parsed = currentSchema.safeParse({ currentPasscode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }

    const rejection = await checkCurrentPasscode(
      admin.id,
      parsed.data.currentPasscode,
    );

    if (rejection) {
      return rejection;
    }
    if ((await countHiddenUsers(admin.id)) > 0) {
      return fail(AUTH_MESSAGES.PASSCODE_HAS_HIDDEN_CHATS);
    }
    await setAdminPasscodeHash(admin.id, null);
    await clearUnlock();
    return SUCCESS;
  },
);

// The lock screen. Lock-exempt: a locked admin is exactly who calls this.
export const verifyPasscode = withResultErrorHandling(
  "verifyPasscode",
  async (passcode: string): Promise<PasscodeResult> => {
    const admin = await requireAdminSession();
    const parsed = currentSchema.safeParse({ currentPasscode: passcode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }

    const rejection = await checkCurrentPasscode(
      admin.id,
      parsed.data.currentPasscode,
    );

    if (rejection) {
      return rejection;
    }
    // Coming back from a lock starts without revealed trainees (KAN-163).
    await clearReveal();
    await issueUnlock(admin.id);
    return SUCCESS;
  },
);

// "Quên mã khoá": the account password proves it is the admin, then a new
// passcode replaces the old one. Wrong passwords share the login limiter.
export const resetPasscodeWithPassword = withResultErrorHandling(
  "resetPasscodeWithPassword",
  async (password: string, newPasscode: string): Promise<PasscodeResult> => {
    const admin = await requireAdminSession();
    const parsed = resetSchema.safeParse({ password, newPasscode });

    if (!parsed.success) {
      return fail(firstIssue(parsed.error));
    }

    const limiterKey = passcodeResetLimiterKey(admin.id);

    if (await isLocked(limiterKey)) {
      return fail(AUTH_MESSAGES.LOGIN_LOCKED);
    }

    const secrets = await findAdminSecrets(admin.id);

    if (
      !secrets ||
      !(await verifyPassword(parsed.data.password, secrets.passwordHash))
    ) {
      await recordFailure(limiterKey);
      return fail(AUTH_MESSAGES.PASSCODE_RESET_PASSWORD_WRONG);
    }

    await clearAttempts(limiterKey);
    await setAdminPasscodeHash(
      admin.id,
      await hashPassword(parsed.data.newPasscode),
    );
    await issueUnlock(admin.id);
    return SUCCESS;
  },
);
