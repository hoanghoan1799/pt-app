import type { PasscodeFailure } from "@/features/auth/types/passcode";
import type { ActionErrorResult } from "@/types/error";

// The action wrapper types a failure as the plain ActionErrorResult (it also
// covers unexpected errors); passcode failures carry the extra fields.
export const toPasscodeFailure = (failure: ActionErrorResult) =>
  failure as PasscodeFailure;

// Wrong passcode with attempts left when the server counted them, else its
// message. The caller passes the translated "wrong, N left" text.
export const describePasscodeFailure = (
  failure: PasscodeFailure,
  describeAttemptsLeft: (attemptsLeft: number) => string,
) =>
  failure.attemptsLeft === undefined
    ? failure.message
    : describeAttemptsLeft(failure.attemptsLeft);
