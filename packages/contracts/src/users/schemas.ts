import {
  ADMIN_ROLES,
  ADMIN_USERNAME_PATTERN,
  EMAIL_MAX_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
  USER_PASSWORD_MAX,
} from "../auth/constants.js";
import { normalizeName } from "../name.js";
import { aliasValueSchema } from "./alias-rules.js";
import {
  APP_LOCALES,
  AVATAR_KINDS,
  BIO_MAX_LENGTH,
  CHAT_COLOR_KEYS,
  EMAIL_MESSAGES,
  HIDDEN_USERS_MESSAGES,
  HIDE_USERS_MAX,
  MEMBER_MESSAGES,
  MEMBER_NAME_MAX_LENGTH,
  PRESENCE_MESSAGES,
  PROFILE_MESSAGES,
  PT_MESSAGES,
} from "./constants.js";
import { z } from "zod";

const isoDate = z.iso.datetime();
const id = z.number().int().positive();

// Lookup/login email: trimmed, 254 characters at most, a real address.
export const emailSchema = z
  .string()
  .trim()
  .min(1, EMAIL_MESSAGES.REQUIRED)
  .max(EMAIL_MAX_LENGTH, EMAIL_MESSAGES.TOO_LONG)
  .pipe(z.email(EMAIL_MESSAGES.INVALID));

// ---- Trainees (admin side) ----

export const createTraineeRequestSchema = z.object({
  name: z
    .string()
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .min(1, MEMBER_MESSAGES.NAME_REQUIRED)
        .max(MEMBER_NAME_MAX_LENGTH, MEMBER_MESSAGES.NAME_TOO_LONG),
    ),
  email: emailSchema,
  // Only a super admin may choose; a PT's trainee always joins their workspace.
  ptAdminId: id.nullable().optional(),
});
export type CreateTraineeRequest = z.infer<typeof createTraineeRequestSchema>;

export const changeTraineeEmailRequestSchema = z.object({
  email: emailSchema,
});
export type ChangeTraineeEmailRequest = z.infer<
  typeof changeTraineeEmailRequestSchema
>;

export const assignTraineePtRequestSchema = z.object({
  ptAdminId: id.nullable(),
});
export type AssignTraineePtRequest = z.infer<
  typeof assignTraineePtRequestSchema
>;

export const listTraineesQuerySchema = z.object({
  // Accent- and case-insensitive part of the name.
  q: z.string().trim().max(60).optional(),
  // Super admin only: a PT's list is always their own workspace.
  ptAdminId: z.coerce.number().int().positive().optional(),
});
export type ListTraineesQuery = z.infer<typeof listTraineesQuerySchema>;

export const traineeSummarySchema = z.object({
  id,
  // The real name and the name this admin sees (their private nickname if set).
  name: z.string(),
  displayName: z.string(),
  ptAdminId: id.nullable(),
  avatarUrl: z.string().nullable(),
});
export type TraineeSummary = z.infer<typeof traineeSummarySchema>;

export const traineeListResponseSchema = z.object({
  trainees: z.array(traineeSummarySchema),
});
export type TraineeListResponse = z.infer<typeof traineeListResponseSchema>;

export const traineeDetailSchema = traineeSummarySchema.extend({
  email: z.string().nullable(),
  // Has an email, so can sign in.
  hasLogin: z.boolean(),
  chatEnabled: z.boolean(),
  // True when the asking admin hid this trainee (only they ever see this).
  hidden: z.boolean(),
  createdAt: isoDate,
});
export type TraineeDetail = z.infer<typeof traineeDetailSchema>;

// The password is returned once and never stored in plain text.
export const traineeCredentialsResponseSchema = z.object({
  id,
  name: z.string(),
  email: z.string(),
  ptAdminId: id.nullable(),
  password: z.string(),
});
export type TraineeCredentialsResponse = z.infer<
  typeof traineeCredentialsResponseSchema
>;

export const passwordResetResponseSchema = z.object({ password: z.string() });
export type PasswordResetResponse = z.infer<typeof passwordResetResponseSchema>;

// ---- PT and admin accounts (super admin) ----

export const createPtRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(ADMIN_USERNAME_PATTERN, PT_MESSAGES.USERNAME_INVALID),
  password: z
    .string()
    .min(MIN_ADMIN_PASSWORD_LENGTH, PT_MESSAGES.PASSWORD_TOO_SHORT)
    .max(USER_PASSWORD_MAX, PT_MESSAGES.PASSWORD_TOO_LONG),
});
export type CreatePtRequest = z.infer<typeof createPtRequestSchema>;

export const setAdminVerifiedRequestSchema = z.object({
  verified: z.boolean(),
});
export type SetAdminVerifiedRequest = z.infer<
  typeof setAdminVerifiedRequestSchema
>;

export const adminAccountSchema = z.object({
  id,
  username: z.string(),
  role: z.enum(ADMIN_ROLES),
  verified: z.boolean(),
  // Trainees in this account's workspace.
  traineeCount: z.number().int().nonnegative(),
});
export type AdminAccount = z.infer<typeof adminAccountSchema>;

export const adminAccountListResponseSchema = z.object({
  accounts: z.array(adminAccountSchema),
});
export type AdminAccountListResponse = z.infer<
  typeof adminAccountListResponseSchema
>;

// ---- Own profile and settings ----

export const userProfileResponseSchema = z.object({
  id,
  name: z.string(),
  email: z.string().nullable(),
  locale: z.string().nullable(),
  bio: z.string().nullable(),
  chatColor: z.string().nullable(),
  chatEnabled: z.boolean(),
  avatarUrl: z.string().nullable(),
  ptAdminId: id.nullable(),
});
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

export const adminProfileResponseSchema = z.object({
  id,
  username: z.string(),
  role: z.enum(ADMIN_ROLES),
  verified: z.boolean(),
  locale: z.string().nullable(),
  bio: z.string().nullable(),
  chatColor: z.string().nullable(),
  presenceHidden: z.boolean(),
  avatarUrl: z.string().nullable(),
});
export type AdminProfileResponse = z.infer<typeof adminProfileResponseSchema>;

export const setLocaleRequestSchema = z.object({
  locale: z.enum(APP_LOCALES, PROFILE_MESSAGES.LOCALE_INVALID),
});
export type SetLocaleRequest = z.infer<typeof setLocaleRequestSchema>;

export const setBioRequestSchema = z.object({
  bio: z.string().trim().max(BIO_MAX_LENGTH, PROFILE_MESSAGES.BIO_TOO_LONG),
});
export type SetBioRequest = z.infer<typeof setBioRequestSchema>;

// null = back to the default colour.
export const setChatColorRequestSchema = z.object({
  color: z.enum(CHAT_COLOR_KEYS, PROFILE_MESSAGES.COLOR_INVALID).nullable(),
});
export type SetChatColorRequest = z.infer<typeof setChatColorRequestSchema>;

export const chatColorResponseSchema = z.object({
  color: z.string().nullable(),
});
export type ChatColorResponse = z.infer<typeof chatColorResponseSchema>;

export const setPresenceHiddenRequestSchema = z.object({
  isHidden: z.boolean(PRESENCE_MESSAGES.INVALID),
});
export type SetPresenceHiddenRequest = z.infer<
  typeof setPresenceHiddenRequestSchema
>;

export const presenceHiddenResponseSchema = z.object({
  presenceHidden: z.boolean(),
});

// ---- Avatars ----

// Any string: the size and the image bytes are checked by the service so a big
// or fake photo gets the specific message, not a generic validation error.
export const setAvatarRequestSchema = z.object({ dataUrl: z.string() });
export type SetAvatarRequest = z.infer<typeof setAvatarRequestSchema>;

export const avatarResponseSchema = z.object({
  avatarUrl: z.string().nullable(),
});
export type AvatarResponse = z.infer<typeof avatarResponseSchema>;

export const avatarParamsSchema = z.object({
  kind: z.enum(AVATAR_KINDS),
  id: z.coerce.number().int().positive(),
});

// ---- Hidden trainees ----

export const hideUsersRequestSchema = z.object({
  userIds: z
    .array(id, HIDDEN_USERS_MESSAGES.INVALID_INPUT)
    .min(1, HIDDEN_USERS_MESSAGES.INVALID_INPUT)
    .max(HIDE_USERS_MAX, HIDDEN_USERS_MESSAGES.INVALID_INPUT),
});
export type HideUsersRequest = z.infer<typeof hideUsersRequestSchema>;

export const hideUsersResponseSchema = z.object({
  hidden: z.number().int().nonnegative(),
});

export const hiddenStatusResponseSchema = z.object({ hidden: z.boolean() });

export const hiddenUserSchema = z.object({
  userId: id,
  userName: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export const hiddenUsersResponseSchema = z.object({
  users: z.array(hiddenUserSchema),
});
export type HiddenUsersResponse = z.infer<typeof hiddenUsersResponseSchema>;

// ---- Contact aliases ----

export const setContactAliasRequestSchema = z.object({
  alias: aliasValueSchema,
});
export type SetContactAliasRequest = z.infer<
  typeof setContactAliasRequestSchema
>;

export const contactAliasResponseSchema = z.object({
  targetKey: z.string(),
  alias: z.string(),
});
export type ContactAliasResponse = z.infer<typeof contactAliasResponseSchema>;

export const contactAliasListResponseSchema = z.object({
  aliases: z.record(z.string(), z.string()),
});
export type ContactAliasListResponse = z.infer<
  typeof contactAliasListResponseSchema
>;
