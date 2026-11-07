import type { ActionErrorResult } from "@/types/error";

// A refused passcode action. `attemptsLeft` counts down to the sign-out;
// `signedOut` tells the client the admin session ended and it must go to the
// login page.
export type PasscodeFailure = ActionErrorResult & {
  attemptsLeft?: number;
  signedOut?: boolean;
};

export type PasscodeResult = { status: "success" } | PasscodeFailure;
