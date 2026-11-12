import { UNLOCK_WINDOW_SECONDS } from "@/features/auth/utils/passcode-rules";

// True when the page was hidden for at least the unlock window, so the server
// unlock has expired and the lock screen must show on return.
export const shouldLockAfterHidden = (
  hiddenAtMs: number | null,
  nowMs: number,
  windowSeconds: number = UNLOCK_WINDOW_SECONDS,
) => hiddenAtMs !== null && nowMs - hiddenAtMs >= windowSeconds * 1000;
