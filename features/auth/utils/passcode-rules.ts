import { z } from "zod";

import { AUTH_MESSAGES } from "@/features/auth/constants/messages";

export const PASSCODE_LENGTH = 4;
// This many wrong passcodes in a row sign the admin out (KAN-160, Q5).
export const PASSCODE_MAX_FAILS = 5;
// How long an unlock stays valid without activity: 5 minutes.
export const UNLOCK_WINDOW_SECONDS = 300;

export const passcodeSchema = z
  .string()
  .regex(
    new RegExp(`^\\d{${PASSCODE_LENGTH}}$`),
    AUTH_MESSAGES.PASSCODE_INVALID,
  );

export const isValidPasscode = (value: string) =>
  passcodeSchema.safeParse(value).success;

// Wrong attempts left before sign-out, never below 0.
export const attemptsLeft = (failedCount: number) =>
  Math.max(0, PASSCODE_MAX_FAILS - failedCount);

// True when `failedCount` (already including the latest wrong attempt) means
// the admin must be signed out.
export const shouldSignOut = (failedCount: number) =>
  failedCount >= PASSCODE_MAX_FAILS;

// Unix seconds when an unlock issued at `nowSeconds` stops being valid.
export const unlockExpiry = (nowSeconds: number) =>
  nowSeconds + UNLOCK_WINDOW_SECONDS;
