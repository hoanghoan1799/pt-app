// 5 failures inside 15 minutes lock the key for 15 minutes (KAN-82, D9).
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
