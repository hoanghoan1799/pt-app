import { EMAIL_MAX_LENGTH } from "./auth/constants.js";
import {
  cursorPageSchema,
  cursorSchema,
  pageLimitSchema,
} from "./pagination.js";
import {
  parseSocialActorKey,
  SOCIAL_AUTHOR_KINDS,
  SOCIAL_CAPTION_MAX_LENGTH,
  SOCIAL_COMMENT_MAX_LENGTH,
  SOCIAL_FRIEND_MESSAGES,
  SOCIAL_MESSAGES,
  SOCIAL_NOTIFICATION_KINDS,
  SOCIAL_PAGE_LIMITS,
  SOCIAL_POST_PRIVACIES,
  SOCIAL_REACTION_EMOJIS,
  SOCIAL_RELATIONSHIPS,
  SOCIAL_REPORT_REASON_MAX_LENGTH,
  SOCIAL_REPORT_TARGET_KINDS,
} from "./social.js";
import { z } from "zod";

// REST schemas of the social API. Field rules and messages match the web's
// features/social/utils/*-rules.ts.

const iso = z.iso.datetime();
const MAX_ID = 2_147_483_647;
const idSchema = z.number().int().positive().max(MAX_ID);

// Path ids: digits only, no "1e3" or " 7" that z.coerce would accept.
const pathId = z
  .string()
  .regex(/^[1-9]\d{0,8}$/, SOCIAL_MESSAGES.NOT_FOUND)
  .transform(Number)
  .pipe(z.number().int().positive());

export const socialIdPathSchema = z.object({ id: pathId });
export const socialUserIdPathSchema = z.object({ userId: pathId });
// "user:12" / "admin:3", the key reactions and notifications use.
export const socialProfilePathSchema = z.object({
  key: z.string().transform((value, ctx) => {
    const parsed = parseSocialActorKey(value);

    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message: SOCIAL_FRIEND_MESSAGES.NOT_FOUND,
      });
      return z.NEVER;
    }
    return parsed;
  }),
});

// ---- Requests -------------------------------------------------------------

export const socialPrivacySchema = z.enum(SOCIAL_POST_PRIVACIES);

const captionSchema = z
  .string()
  .trim()
  .max(SOCIAL_CAPTION_MAX_LENGTH, SOCIAL_MESSAGES.CAPTION_TOO_LONG);

export const socialCreatePostRequestSchema = z.object({
  caption: captionSchema,
  privacy: socialPrivacySchema,
  photoId: idSchema.nullable().default(null),
});
export type SocialCreatePostRequest = z.infer<
  typeof socialCreatePostRequestSchema
>;

export const socialEditPostRequestSchema = z.object({
  caption: captionSchema,
  privacy: socialPrivacySchema,
});
export type SocialEditPostRequest = z.infer<typeof socialEditPostRequestSchema>;

export const socialReactionRequestSchema = z.object({
  emoji: z.enum(SOCIAL_REACTION_EMOJIS, SOCIAL_MESSAGES.REACTION_INVALID),
});
export type SocialReactionRequest = z.infer<typeof socialReactionRequestSchema>;

export const socialCommentRequestSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, SOCIAL_MESSAGES.COMMENT_EMPTY)
    .max(SOCIAL_COMMENT_MAX_LENGTH, SOCIAL_MESSAGES.COMMENT_TOO_LONG),
});
export type SocialCommentRequest = z.infer<typeof socialCommentRequestSchema>;

export const socialFriendRequestSchema = z.object({ userId: idSchema });
export type SocialFriendRequest = z.infer<typeof socialFriendRequestSchema>;

export const socialReportRequestSchema = z.object({
  targetKind: z.enum(SOCIAL_REPORT_TARGET_KINDS),
  targetId: idSchema,
  reason: z
    .string()
    .trim()
    .max(SOCIAL_REPORT_REASON_MAX_LENGTH, SOCIAL_FRIEND_MESSAGES.REASON_TOO_LONG)
    .optional()
    .default(""),
});
export type SocialReportRequest = z.infer<typeof socialReportRequestSchema>;

export const socialResolveReportRequestSchema = z.object({
  resolution: z.enum(["kept", "deleted"]),
});
export type SocialResolveReportRequest = z.infer<
  typeof socialResolveReportRequestSchema
>;

// `Idempotency-Key` header of post creation.
export const SOCIAL_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

// ---- Queries --------------------------------------------------------------

const pageQuery = (limits: { DEFAULT: number; MAX: number }) =>
  z.object({
    cursor: cursorSchema.optional(),
    limit: pageLimitSchema(limits.DEFAULT, limits.MAX),
  });

export const socialPostsQuerySchema = pageQuery(SOCIAL_PAGE_LIMITS.POSTS);
export type SocialPostsQuery = z.infer<typeof socialPostsQuerySchema>;
export const socialCommentsQuerySchema = pageQuery(SOCIAL_PAGE_LIMITS.COMMENTS);
export type SocialCommentsQuery = z.infer<typeof socialCommentsQuerySchema>;
export const socialNotificationsQuerySchema = pageQuery(
  SOCIAL_PAGE_LIMITS.NOTIFICATIONS,
);
export type SocialNotificationsQuery = z.infer<
  typeof socialNotificationsQuerySchema
>;

export const socialPeopleQuerySchema = z.object({
  email: z.string().max(EMAIL_MAX_LENGTH),
});
export type SocialPeopleQuery = z.infer<typeof socialPeopleQuerySchema>;

// ---- Responses ------------------------------------------------------------

const authorKind = z.enum(SOCIAL_AUTHOR_KINDS);

export const socialMeResponseSchema = z.object({
  kind: authorKind,
  id: z.number().int(),
  // Admins never need the terms.
  termsAccepted: z.boolean(),
  termsVersion: z.number().int(),
  // The privacy a trainee's composer starts with ("everyone" for admins).
  postPrivacyDefault: z.enum(SOCIAL_POST_PRIVACIES),
  unreadNotifications: z.number().int(),
});
export type SocialMeResponse = z.infer<typeof socialMeResponseSchema>;

export const socialReactionSummarySchema = z.object({
  counts: z.array(z.object({ emoji: z.string(), count: z.number().int() })),
  total: z.number().int(),
  mine: z.string().nullable(),
});

export const socialPostResponseSchema = z.object({
  id: z.number().int(),
  authorKind,
  authorId: z.number().int(),
  authorName: z.string(),
  authorAvatarUrl: z.string().nullable(),
  authorVerified: z.boolean(),
  caption: z.string(),
  privacy: socialPrivacySchema,
  photo: z
    .object({
      id: z.number().int(),
      url: z.string(),
      width: z.number().int(),
      height: z.number().int(),
    })
    .nullable(),
  createdAt: iso,
  edited: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  reactions: socialReactionSummarySchema,
  commentCount: z.number().int(),
});
export type SocialPostResponse = z.infer<typeof socialPostResponseSchema>;

export const socialPostPageResponseSchema = cursorPageSchema(
  socialPostResponseSchema,
);
export type SocialPostPageResponse = z.infer<
  typeof socialPostPageResponseSchema
>;

export const socialCreatePostResponseSchema = z.object({
  post: socialPostResponseSchema,
});

export const socialCommentResponseSchema = z.object({
  id: z.number().int(),
  authorKind,
  authorId: z.number().int(),
  authorName: z.string(),
  authorAvatarUrl: z.string().nullable(),
  authorVerified: z.boolean(),
  body: z.string(),
  createdAt: iso,
  edited: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
export type SocialCommentResponse = z.infer<typeof socialCommentResponseSchema>;
export const socialCommentPageResponseSchema = cursorPageSchema(
  socialCommentResponseSchema,
);

export const socialReactorsResponseSchema = z.object({
  items: z.array(
    z.object({ name: z.string(), emoji: z.string(), isMe: z.boolean() }),
  ),
});

export const socialPhotoUploadResponseSchema = z.object({
  photo: z.object({ id: z.number().int() }),
});

export const socialProfileResponseSchema = z.object({
  kind: authorKind,
  id: z.number().int(),
  // The viewer's private nickname when set, else the real name.
  name: z.string(),
  realName: z.string(),
  alias: z.string(),
  avatarUrl: z.string().nullable(),
  verified: z.boolean(),
  bio: z.string(),
  role: z.enum(["trainee", "pt", "super_admin"]),
  isOwn: z.boolean(),
  // Trainee viewing another trainee only.
  relationship: z.enum(SOCIAL_RELATIONSHIPS).nullable(),
  friendCount: z.number().int().nullable(),
  stats: z
    .object({
      workouts: z.number().int(),
      streak: z.number().int(),
      totalSets: z.number().int(),
    })
    .nullable(),
  canBlock: z.boolean(),
  canReport: z.boolean(),
  composerPrivacy: socialPrivacySchema.nullable(),
});
export type SocialProfileResponse = z.infer<typeof socialProfileResponseSchema>;

const personSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});

export const socialPeopleResponseSchema = z.object({
  result: personSchema
    .extend({ relationship: z.enum(["none", "friends", "sent", "received"]) })
    .nullable(),
});
export const socialFriendsResponseSchema = z.object({
  items: z.array(personSchema),
});
export const socialFriendRequestsResponseSchema = z.object({
  received: z.array(personSchema),
  sent: z.array(personSchema),
});
export const socialSendFriendRequestResponseSchema = z.object({
  // True when they had already asked me, so the request became a friendship.
  accepted: z.boolean(),
});

export const socialNotificationResponseSchema = z.object({
  id: z.number().int(),
  kind: z.enum(SOCIAL_NOTIFICATION_KINDS),
  text: z.string(),
  // The post to open; null for friend events (open the friends page).
  postId: z.number().int().nullable(),
  actorKey: z.string(),
  actorName: z.string(),
  actorAvatarUrl: z.string().nullable(),
  createdAt: iso,
  isUnread: z.boolean(),
});
export const socialNotificationPageResponseSchema = cursorPageSchema(
  socialNotificationResponseSchema,
).extend({ unreadCount: z.number().int() });
export type SocialNotificationPageResponse = z.infer<
  typeof socialNotificationPageResponseSchema
>;

export const socialReportResponseSchema = z.object({
  id: z.number().int(),
  targetKind: z.enum(SOCIAL_REPORT_TARGET_KINDS),
  targetId: z.number().int(),
  reporterName: z.string(),
  reason: z.string(),
  createdAt: iso,
  // Short text of the reported content; null when it no longer exists.
  preview: z.string().nullable(),
  targetName: z.string().nullable(),
  // The post to look at (post and comment reports); null otherwise.
  postId: z.number().int().nullable(),
});
export const socialCreatedResponseSchema = z.object({ id: z.number().int() });

export const socialReportsResponseSchema = z.object({
  items: z.array(socialReportResponseSchema),
  openCount: z.number().int(),
});
