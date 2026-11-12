import { z } from "zod";

export const EMAIL_MAX_LENGTH = 254;

export const EMAIL_MESSAGES = {
  REQUIRED: "Nhập email",
  INVALID: "Email không hợp lệ",
  TOO_LONG: `Email tối đa ${EMAIL_MAX_LENGTH} ký tự`,
} as const;

// Lookup key: " An@Mail.COM " and "an@mail.com" are the same login.
export const toEmailKey = (email: string) => email.trim().toLowerCase();

export const emailSchema = z
  .string()
  .trim()
  .min(1, EMAIL_MESSAGES.REQUIRED)
  .max(EMAIL_MAX_LENGTH, EMAIL_MESSAGES.TOO_LONG)
  .pipe(z.email(EMAIL_MESSAGES.INVALID));
