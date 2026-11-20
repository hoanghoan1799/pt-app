import {
  CHAT_BODY_MAX_LENGTH,
  CHAT_MESSAGES,
  CHAT_REACTION_EMOJIS,
} from "../chat/constants.js";
import { chatPhotoIdsSchema } from "../chat/schemas.js";
import { stickerInputSchema } from "../chat/stickers.js";
import {
  GROUP_ADD_MAX_IDS,
  GROUP_MESSAGES,
  GROUP_ROLES,
  GROUP_SENDER_TAGS,
} from "./constants.js";
import {
  GROUP_ADD_OUTCOMES,
  GROUP_SEND_BLOCK_REASONS,
  groupNameSchema,
} from "./rules.js";
import {
  GROUP_MEMBER_KEY_PATTERN,
  groupSystemEventSchema,
} from "./system-event.js";
import { z } from "zod";

// REST request and response shapes of group chat (/v1/chat/groups).

const positiveInt = z.number().int().positive();
const cursor = z.coerce.number().int().positive();
const iso = z.string();

// --- Requests ---------------------------------------------------------------

// Ids stay loose on purpose: a bad id is skipped with its own result by the
// add instead of failing the whole request (company G1 / KAN-39).
const memberIds = z.array(z.unknown()).max(GROUP_ADD_MAX_IDS).default([]);

export const groupCreateRequestSchema = z.object({
  name: groupNameSchema,
  userIds: memberIds,
  ptIds: memberIds,
});
export type GroupCreateRequest = z.infer<typeof groupCreateRequestSchema>;

export const groupAddMembersRequestSchema = z.object({
  userIds: memberIds,
  ptIds: memberIds,
});
export type GroupAddMembersRequest = z.infer<
  typeof groupAddMembersRequestSchema
>;

export const groupMemberKeyParamSchema = z
  .string()
  .regex(GROUP_MEMBER_KEY_PATTERN, GROUP_MESSAGES.INVALID_INPUT);

export const groupRenameRequestSchema = z.object({ name: groupNameSchema });
export type GroupRenameRequest = z.infer<typeof groupRenameRequestSchema>;

export const groupManagersOnlyRequestSchema = z.object({
  enabled: z.boolean(),
});
export type GroupManagersOnlyRequest = z.infer<
  typeof groupManagersOnlyRequestSchema
>;

export const groupMuteRequestSchema = z.object({ muted: z.boolean() });
export type GroupMuteRequest = z.infer<typeof groupMuteRequestSchema>;

export const groupHideRequestSchema = z.object({ hidden: z.boolean() });
export type GroupHideRequest = z.infer<typeof groupHideRequestSchema>;

export const groupResolveAlertRequestSchema = z.object({
  choice: z.enum(["keep", "remove"]),
});
export type GroupResolveAlertRequest = z.infer<
  typeof groupResolveAlertRequestSchema
>;

// Text and/or up to 10 photos, or a sticker alone (the coach chat rules
// without the post quote). The `Idempotency-Key` header (or `clientId`) is the
// retry key, scoped to the sender.
export const groupSendMessageRequestSchema = z
  .object({
    body: z
      .string(CHAT_MESSAGES.INVALID_INPUT)
      .trim()
      .min(1, CHAT_MESSAGES.INVALID_INPUT)
      .max(CHAT_BODY_MAX_LENGTH, CHAT_MESSAGES.INVALID_INPUT)
      .optional(),
    sticker: stickerInputSchema.optional(),
    photoIds: chatPhotoIdsSchema.optional(),
    clientId: z.uuid().optional(),
    replyToMessageId: positiveInt.optional(),
  })
  .refine((value) => {
    const hasPhotos = !!value.photoIds?.length;

    return value.sticker === undefined
      ? value.body !== undefined || hasPhotos
      : value.body === undefined && !hasPhotos;
  }, CHAT_MESSAGES.INVALID_INPUT);
export type GroupSendMessageRequest = z.infer<
  typeof groupSendMessageRequestSchema
>;

export const groupEditMessageRequestSchema = z.object({
  body: z
    .string(CHAT_MESSAGES.INVALID_INPUT)
    .trim()
    .min(1, CHAT_MESSAGES.INVALID_INPUT)
    .max(CHAT_BODY_MAX_LENGTH, CHAT_MESSAGES.INVALID_INPUT),
});
export type GroupEditMessageRequest = z.infer<
  typeof groupEditMessageRequestSchema
>;

export const groupReactRequestSchema = z.object({
  emoji: z.enum(CHAT_REACTION_EMOJIS, CHAT_MESSAGES.INVALID_INPUT),
});
export type GroupReactRequest = z.infer<typeof groupReactRequestSchema>;

export const groupMarkReadRequestSchema = z.object({
  lastReadMessageId: z.number().int().nonnegative(),
});
export type GroupMarkReadRequest = z.infer<typeof groupMarkReadRequestSchema>;

// `after` (newer than, oldest first: polling) or `before` (the page older
// than); never both. `changedSince` (epoch ms) adds the messages edited,
// unsent, reacted to or hidden since.
export const groupThreadQuerySchema = z
  .object({
    after: cursor.optional(),
    before: cursor.optional(),
    changedSince: z.coerce.number().int().nonnegative().optional(),
  })
  .refine(
    (value) => value.after === undefined || value.before === undefined,
    "after and before cannot be used together",
  );
export type GroupThreadQuery = z.infer<typeof groupThreadQuerySchema>;

export const groupCandidatesQuerySchema = z.object({
  // Leave out the people already in this group.
  groupId: cursor.optional(),
});
export type GroupCandidatesQuery = z.infer<typeof groupCandidatesQuerySchema>;

// --- Responses --------------------------------------------------------------

const groupRole = z.enum(GROUP_ROLES);

export const groupPhotoViewSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  alt: z.string(),
});

export const groupMessageViewSchema = z.object({
  id: z.number().int(),
  groupId: z.number().int(),
  kind: z.enum(["message", "system"]),
  // "user:<id>" | "admin:<id>"; null for system lines.
  senderKey: z.string().nullable(),
  // The viewer's private nickname first, else the real name; null = deleted
  // account ("Deleted member").
  senderName: z.string().nullable(),
  senderDeleted: z.boolean(),
  senderTag: z.enum(GROUP_SENDER_TAGS).nullable(),
  // Empty once unsent or hidden.
  body: z.string(),
  // A system line's event (null for messages and for an unreadable row).
  systemEvent: groupSystemEventSchema.nullable(),
  // "super_admin" only on the PT-change alert (super admins only see it).
  audience: z.enum(["super_admin"]).nullable(),
  clientId: z.string().nullable(),
  replyTo: z
    .object({
      id: z.number().int(),
      senderKey: z.string().nullable(),
      senderName: z.string().nullable(),
      snippet: z.string(),
      // Unsent or hidden original: the quote shows a tombstone.
      unavailable: z.boolean(),
      isSticker: z.boolean(),
      isPhoto: z.boolean(),
      photoCount: z.number().int(),
    })
    .nullable(),
  sticker: z
    .object({
      kind: z.enum(["pack", "giphy", "custom"]),
      url: z.string(),
      alt: z.string(),
    })
    .nullable(),
  // The cover (the first of `photos`).
  photo: groupPhotoViewSchema.nullable(),
  photos: z.array(groupPhotoViewSchema),
  // Shown names of the member keys a system line names (null = deleted
  // account); empty for messages.
  eventNames: z.record(z.string(), z.string().nullable()),
  silent: z.boolean(),
  deleted: z.boolean(),
  hidden: z.boolean(),
  edited: z.boolean(),
  // Most used first; `mine` marks the viewer's own.
  reactions: z.array(
    z.object({
      emoji: z.string(),
      count: z.number().int(),
      mine: z.boolean(),
    }),
  ),
  // Members other than the sender who read up to here; own messages only.
  seenCount: z.number().int(),
  createdAt: iso,
  // Last edit, unsend, reaction or hide; null before any.
  updatedAt: iso.nullable(),
});
export type GroupMessageView = z.infer<typeof groupMessageViewSchema>;

export const groupMessageResponseSchema = z.object({
  message: groupMessageViewSchema,
});

export const groupHeaderSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  // Signed, versioned URL of the group photo; null = initials.
  avatarUrl: z.string().nullable(),
  managersOnly: z.boolean(),
  dissolved: z.boolean(),
});
export type GroupHeader = z.infer<typeof groupHeaderSchema>;

// What the caller may do in this group (the server checks again on every
// write).
export const groupViewerSchema = z.object({
  key: z.string(),
  role: groupRole,
  isManager: z.boolean(),
  canManage: z.boolean(),
  isSuperAdmin: z.boolean(),
  muted: z.boolean(),
  // Why the composer is a banner right now; null = may send.
  sendBlock: z.enum(GROUP_SEND_BLOCK_REASONS).nullable(),
});
export type GroupViewer = z.infer<typeof groupViewerSchema>;

export const groupThreadResponseSchema = z.object({
  messages: z.array(groupMessageViewSchema),
  hasMore: z.boolean(),
  // Messages changed after `changedSince`.
  changes: z.array(groupMessageViewSchema),
  lastChangeAt: z.number().int(),
  group: groupHeaderSchema,
  viewer: groupViewerSchema,
});
export type GroupThreadResponse = z.infer<typeof groupThreadResponseSchema>;

export const groupMemberViewSchema = z.object({
  key: z.string(),
  kind: z.enum(["user", "admin"]),
  id: z.number().int(),
  role: groupRole,
  // The viewer's nickname first, else the real name.
  name: z.string(),
  avatarUrl: z.string().nullable(),
  isCreator: z.boolean(),
});
export type GroupMemberView = z.infer<typeof groupMemberViewSchema>;

export const groupInfoResponseSchema = z.object({
  group: groupHeaderSchema,
  viewer: groupViewerSchema,
  // Explicit active members plus every super admin ("Manager").
  members: z.array(groupMemberViewSchema),
});
export type GroupInfoResponse = z.infer<typeof groupInfoResponseSchema>;

export const groupLastMessageSchema = z.object({
  id: z.number().int(),
  kind: z.enum(["message", "system"]),
  senderKey: z.string().nullable(),
  // Empty for unsent, hidden, photo, sticker and system rows.
  preview: z.string(),
  media: z.enum(["photo", "sticker"]).nullable(),
  photoCount: z.number().int(),
  systemEvent: groupSystemEventSchema.nullable(),
  createdAt: iso,
});

export const groupSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  managersOnly: z.boolean(),
  muted: z.boolean(),
  unread: z.number().int(),
  canManage: z.boolean(),
  dissolved: z.boolean(),
  lastMessage: groupLastMessageSchema.nullable(),
  lastMessageAt: iso.nullable(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupListResponseSchema = z.object({
  groups: z.array(groupSummarySchema),
});

export const groupUnreadResponseSchema = z.object({
  total: z.number().int(),
  perGroup: z.array(
    z.object({ groupId: z.number().int(), unread: z.number().int() }),
  ),
});
export type GroupUnreadResponse = z.infer<typeof groupUnreadResponseSchema>;

export const groupAddResultSchema = z.object({
  kind: z.enum(["user", "admin"]),
  // The id as sent.
  id: z.unknown(),
  outcome: z.enum(GROUP_ADD_OUTCOMES),
});

export const groupCreateResponseSchema = z.object({
  groupId: z.number().int(),
  results: z.array(groupAddResultSchema),
});

export const groupAddMembersResponseSchema = z.object({
  results: z.array(groupAddResultSchema),
});

const candidate = z.object({
  key: z.string(),
  kind: z.enum(["user", "admin"]),
  id: z.number().int(),
  name: z.string(),
});

export const groupCandidatesResponseSchema = z.object({
  trainees: z.array(candidate),
  // A super admin only (G3: a PT cannot add other PTs).
  pts: z.array(candidate),
});

export const groupEditsResponseSchema = z.object({
  edits: z.array(
    z.object({
      id: z.number().int(),
      previousBody: z.string(),
      editedAt: iso,
    }),
  ),
});

export const groupSeenByResponseSchema = z.object({
  seenBy: z.array(
    z.object({ key: z.string(), role: groupRole, name: z.string() }),
  ),
});

export const groupReadResponseSchema = z.object({
  // 0 = nothing read yet.
  lastReadMessageId: z.number().int(),
});

export const groupPhotoResponseSchema = z.object({
  photo: z.object({ id: z.number().int() }),
});

export const groupAvatarResponseSchema = z.object({
  avatarUrl: z.string().nullable(),
});
