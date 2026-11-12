export const USER_COOKIE = "pt_user";
export const ADMIN_COOKIE = "pt_admin";

const DAY_IN_SECONDS = 60 * 60 * 24;

// The cookie holds the opaque API session token. Lifetimes match the API
// sessions (apps/api/src/auth/session-rules.ts): 400 days is the longest a
// browser accepts for trainees; the API slides the session on use and the
// proxy re-sets the cookie on page navigations, so an active trainee never has
// to log in again. Admins get a fixed 7 days.
export const USER_SESSION_MAX_AGE = DAY_IN_SECONDS * 400;
export const ADMIN_SESSION_MAX_AGE = DAY_IN_SECONDS * 7;

export const MIN_SESSION_SECRET_LENGTH = 32;
