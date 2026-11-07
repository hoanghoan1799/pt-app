import type { PasscodeFailure } from "@/features/auth/types/passcode";
import type { ActionErrorResult } from "@/types/error";

// The action wrapper types a failure as the plain ActionErrorResult (it also
// covers unexpected errors); passcode failures carry the extra fields.
export const toPasscodeFailure = (failure: ActionErrorResult) =>
  failure as PasscodeFailure;

// "Sai mã khoá. Còn N lần." when the server counted attempts, else its message.
export const describePasscodeFailure = (failure: PasscodeFailure) =>
  failure.attemptsLeft === undefined
    ? failure.message
    : `Sai mã khoá. Còn ${failure.attemptsLeft} lần.`;
