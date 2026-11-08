export const USER_COOKIE = "pt_user";
export const ADMIN_COOKIE = "pt_admin";

const DAY_IN_SECONDS = 60 * 60 * 24;

// 400 days is the longest lifetime browsers accept; the proxy re-issues the
// user cookie on visits so an active user never has to type their name again.
export const USER_SESSION_MAX_AGE = DAY_IN_SECONDS * 400;
export const USER_SESSION_REFRESH_AFTER = DAY_IN_SECONDS;
export const ADMIN_SESSION_MAX_AGE = DAY_IN_SECONDS * 7;

export const MIN_SESSION_SECRET_LENGTH = 32;

// Short-lived proof that the admin typed their passcode (KAN-160). Expired or
// missing = locked. Refreshed by the presence heartbeat while the app is open.
export const ADMIN_UNLOCK_COOKIE = "pt_admin_unlock";

// Proof that the admin typed their passcode to see hidden trainees (KAN-163).
export const ADMIN_REVEAL_COOKIE = "pt_admin_reveal";
export const REVEAL_WINDOW_SECONDS = 10 * 60;
