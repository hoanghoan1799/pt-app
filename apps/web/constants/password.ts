export const MIN_ADMIN_PASSWORD_LENGTH = 8;

// scrypt cost parameters (N = 2^14, the Node default) and output size.
export const SCRYPT_COST = 16384;
export const SCRYPT_KEY_LENGTH = 64;
export const SCRYPT_SALT_BYTES = 16;
export const PASSWORD_HASH_PREFIX = "scrypt";

// Admin usernames: letters, digits, dot, dash and underscore; 3–32 characters.
export const ADMIN_USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

// Generated trainee passwords: no look-alikes (I, l, O, 0, 1).
export const GENERATED_PASSWORD_LENGTH = 12;
export const GENERATED_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const GENERATED_PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
export const GENERATED_PASSWORD_DIGITS = "23456789";
export const GENERATED_PASSWORD_ALPHABET =
  GENERATED_PASSWORD_UPPER +
  GENERATED_PASSWORD_LOWER +
  GENERATED_PASSWORD_DIGITS;

// Passwords a trainee chooses themselves.
export const USER_PASSWORD_MIN = 8;
export const USER_PASSWORD_MAX = 128;
