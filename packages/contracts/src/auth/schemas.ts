import {
  ACTOR_ROLES,
  ADMIN_ROLES,
  AUTH_MESSAGES,
  CLIENT_KINDS,
  CLIENT_NAME_MAX,
  EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX,
  PASSCODE_LENGTH,
  USER_PASSWORD_MAX,
  USER_PASSWORD_MIN,
} from "./constants.js";
import { z } from "zod";

const isoDate = z.iso.datetime();

export const clientKindSchema = z.enum(CLIENT_KINDS);

// Sent by every client on login so the "signed-in devices" list can name it.
const clientFields = {
  clientKind: clientKindSchema.default("web"),
  clientName: z.string().trim().min(1).max(CLIENT_NAME_MAX).optional(),
};

// A malformed email is NOT a validation error: it takes the same wrong
// credentials path as an unknown one (counted by the limiter), like the web.
export const userLoginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, AUTH_MESSAGES.EMAIL_CREDENTIALS_REQUIRED)
    .max(EMAIL_MAX_LENGTH),
  password: z
    .string()
    .min(1, AUTH_MESSAGES.EMAIL_CREDENTIALS_REQUIRED)
    .max(LOGIN_PASSWORD_MAX),
  ...clientFields,
});
export type UserLoginRequest = z.infer<typeof userLoginRequestSchema>;

export const adminLoginRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, AUTH_MESSAGES.CREDENTIALS_REQUIRED)
    .max(EMAIL_MAX_LENGTH),
  password: z
    .string()
    .min(1, AUTH_MESSAGES.CREDENTIALS_REQUIRED)
    .max(LOGIN_PASSWORD_MAX),
  ...clientFields,
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const sessionResponseSchema = z.object({
  // Public handle of the session, never the secret token.
  id: z.uuid(),
  clientKind: clientKindSchema,
  clientName: z.string().nullable(),
  createdAt: isoDate,
  lastSeenAt: isoDate,
  expiresAt: isoDate,
  // True for the session that made this request.
  current: z.boolean(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionResponseSchema),
});
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;

export const userActorSchema = z.object({
  kind: z.literal("user"),
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string().nullable(),
  locale: z.string().nullable(),
  ptAdminId: z.number().int().positive().nullable(),
});

export const adminActorSchema = z.object({
  kind: z.literal("admin"),
  id: z.number().int().positive(),
  username: z.string(),
  role: z.enum(ADMIN_ROLES),
  verified: z.boolean(),
  locale: z.string().nullable(),
  presenceHidden: z.boolean(),
  hasPasscode: z.boolean(),
  // True while the admin has a passcode and no valid unlock on this session.
  locked: z.boolean(),
  unlockedUntil: isoDate.nullable(),
  // Hidden trainees are visible until this moment (null: not revealed).
  revealedUntil: isoDate.nullable(),
});

export const actorResponseSchema = z.discriminatedUnion("kind", [
  userActorSchema,
  adminActorSchema,
]);
export type ActorResponse = z.infer<typeof actorResponseSchema>;

// GET /auth/me
export const meResponseSchema = z.object({
  role: z.enum(ACTOR_ROLES),
  actor: actorResponseSchema,
  session: sessionResponseSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// POST /auth/login, /auth/admin/login, /auth/refresh. The token is shown once.
export const authTokenResponseSchema = meResponseSchema.extend({
  token: z.string(),
});
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;

export const passcodeSchema = z
  .string()
  .regex(
    new RegExp(`^\\d{${PASSCODE_LENGTH}}$`),
    AUTH_MESSAGES.PASSCODE_INVALID,
  );

export const setPasscodeRequestSchema = z.object({ passcode: passcodeSchema });
export type SetPasscodeRequest = z.infer<typeof setPasscodeRequestSchema>;

export const changePasscodeRequestSchema = z.object({
  currentPasscode: passcodeSchema,
  newPasscode: passcodeSchema,
});
export type ChangePasscodeRequest = z.infer<typeof changePasscodeRequestSchema>;

export const removePasscodeRequestSchema = z.object({
  currentPasscode: passcodeSchema,
});
export type RemovePasscodeRequest = z.infer<typeof removePasscodeRequestSchema>;

export const verifyPasscodeRequestSchema = z.object({
  passcode: passcodeSchema,
});
export type VerifyPasscodeRequest = z.infer<typeof verifyPasscodeRequestSchema>;

export const resetPasscodeRequestSchema = z.object({
  password: z
    .string()
    .min(1, AUTH_MESSAGES.CREDENTIALS_REQUIRED)
    .max(LOGIN_PASSWORD_MAX),
  newPasscode: passcodeSchema,
});
export type ResetPasscodeRequest = z.infer<typeof resetPasscodeRequestSchema>;

// Any string: a malformed code is a quiet "no match" that never touches the
// limiter, so ordinary name searches do not burn attempts.
export const revealHiddenUsersRequestSchema = z.object({
  passcode: z.string().max(64),
});
export type RevealHiddenUsersRequest = z.infer<
  typeof revealHiddenUsersRequestSchema
>;

export const revealHiddenUsersResponseSchema = z.object({
  revealed: z.boolean(),
  revealedUntil: isoDate.nullable(),
});
export type RevealHiddenUsersResponse = z.infer<
  typeof revealHiddenUsersResponseSchema
>;

// The lock state after a passcode action; never the hash.
export const passcodeStatusResponseSchema = z.object({
  hasPasscode: z.boolean(),
  locked: z.boolean(),
  unlockedUntil: isoDate.nullable(),
  revealedUntil: isoDate.nullable(),
});
export type PasscodeStatusResponse = z.infer<
  typeof passcodeStatusResponseSchema
>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, AUTH_MESSAGES.CURRENT_PASSWORD_REQUIRED)
      .max(LOGIN_PASSWORD_MAX),
    newPassword: z
      .string()
      .min(USER_PASSWORD_MIN, AUTH_MESSAGES.NEW_PASSWORD_TOO_SHORT)
      .max(USER_PASSWORD_MAX, AUTH_MESSAGES.NEW_PASSWORD_TOO_LONG),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: AUTH_MESSAGES.NEW_PASSWORD_SAME,
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

// The error body of every failed request (see the API exception filter).
export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  ref: z.string(),
  // Extra facts the application chose to expose, e.g. attemptsLeft.
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
