export const MIN_ADMIN_PASSWORD_LENGTH = 8;

// scrypt cost parameters (N = 2^14, the Node default) and output size.
export const SCRYPT_COST = 16384;
export const SCRYPT_KEY_LENGTH = 64;
export const SCRYPT_SALT_BYTES = 16;
export const PASSWORD_HASH_PREFIX = "scrypt";

// Admin usernames: letters, digits, dot, dash and underscore; 3–32 characters.
export const ADMIN_USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
