export const USER_COOKIE = "pt_user";
export const ADMIN_COOKIE = "pt_admin";

const DAY_IN_SECONDS = 60 * 60 * 24;

export const USER_SESSION_MAX_AGE = DAY_IN_SECONDS * 90;
export const ADMIN_SESSION_MAX_AGE = DAY_IN_SECONDS * 7;

export const MIN_SESSION_SECRET_LENGTH = 32;
