import { CHAT_COLOR_KEYS } from "../users/constants.js";
import {
  CHAT_BODY_MAX_LENGTH,
  CHAT_GALLERY_TABS,
  CHAT_MESSAGES,
  CHAT_REACTION_EMOJIS,
  STICKER_GIPHY_QUERY_MAX_LENGTH,
} from "./constants.js";
import { stickerInputSchema } from "./stickers.js";
import { chatIsSearchableQuery } from "./text-rules.js";
import { z } from "zod";

// REST request and response shapes of the chat, stickers and trainee DMs.

const positiveInt = z.number().int().positive();
const cursor = z.coerce.number().int().positive();
const iso = z.string();

// --- Requests ---------------------------------------------------------------

const bodySchema = z
  .string(CHAT_MESSAGES.INVALID_INPUT)
  .trim()
  .min(1, CHAT_MESSAGES.INVALID_INPUT)
  .max(CHAT_BODY_MAX_LENGTH, CHAT_MESSAGES.INVALID_INPUT);

// Text and/or one photo, or a sticker alone: never a sticker with text or a
// photo, never nothing. `clientId` is the idempotency key; the
// `Idempotency-Key` header carries the same value and wins when both exist.
export const chatSendMessageRequestSchema = z
  .object({
    body: bodySchema.optional(),
    sticker: stickerInputSchema.optional(),
    photoId: positiveInt.optional(),
    clientId: z.uuid().optional(),
    replyToMessageId: positiveInt.optional(),
    // A social post this message replies to (needs a text).
    postId: positiveInt.optional(),
  })
  .refine(
    (value) =>
      value.sticker === undefined
        ? value.body !== undefined || value.photoId !== undefined
        : value.body === undefined && value.photoId === undefined,
    CHAT_MESSAGES.INVALID_INPUT,
  );
export type ChatSendMessageRequest = z.infer<
  typeof chatSendMessageRequestSchema
>;

export const chatEditMessageRequestSchema = z.object({ body: bodySchema });
export type ChatEditMessageRequest = z.infer<
  typeof chatEditMessageRequestSchema
>;

export const chatReactRequestSchema = z.object({
  emoji: z.enum(CHAT_REACTION_EMOJIS, CHAT_MESSAGES.INVALID_INPUT),
});
export type ChatReactRequest = z.infer<typeof chatReactRequestSchema>;

export const chatMarkReadRequestSchema = z.object({
  lastReadMessageId: z.number().int().nonnegative(),
});
export type ChatMarkReadRequest = z.infer<typeof chatMarkReadRequestSchema>;

export const chatSetEnabledRequestSchema = z.object({ enabled: z.boolean() });
export type ChatSetEnabledRequest = z.infer<typeof chatSetEnabledRequestSchema>;

// null = remove my colour for this conversation.
export const chatConversationColorRequestSchema = z.object({
  color: z.enum(CHAT_COLOR_KEYS, CHAT_MESSAGES.COLOR_INVALID).nullable(),
});
export type ChatConversationColorRequest = z.infer<
  typeof chatConversationColorRequestSchema
>;

const flag = z
  .enum(["0", "1"])
  .transform((value) => value === "1")
  .optional();

// `after` (newer than) / `before` (older than) / `around` (jump to a message):
// one at a time. `readUpTo`, `enabled` and `changedSince` are what the polling
// client already knows: only when all of them are current is "nothing
// changed" (204) a valid answer.
export const chatThreadQuerySchema = z
  .object({
    after: cursor.optional(),
    before: cursor.optional(),
    around: cursor.optional(),
    readUpTo: z.coerce.number().int().nonnegative().optional(),
    enabled: flag,
    changedSince: z.coerce.number().int().nonnegative().optional(),
  })
  .refine(
    (value) =>
      [value.after, value.before, value.around].filter(
        (item) => item !== undefined,
      ).length <= 1,
    "after, before and around cannot be used together",
  );
export type ChatThreadQuery = z.infer<typeof chatThreadQuerySchema>;

export const chatSearchQuerySchema = z.object({
  // At least two characters (not counting surrounding spaces), at most 100.
  q: z.string().refine(chatIsSearchableQuery, "Từ khoá tìm kiếm không hợp lệ"),
  before: cursor.optional(),
});
export type ChatSearchQuery = z.infer<typeof chatSearchQuerySchema>;

export const chatGalleryQuerySchema = z.object({
  tab: z.enum(CHAT_GALLERY_TABS).optional().catch(undefined),
  before: cursor.optional(),
});
export type ChatGalleryQuery = z.infer<typeof chatGalleryQuerySchema>;

export const chatInboxQuerySchema = z.object({ hidden: flag });
export type ChatInboxQuery = z.infer<typeof chatInboxQuerySchema>;

export const chatBubblesQuerySchema = z.object({
  ids: z.string().max(200).optional(),
});
export type ChatBubblesQuery = z.infer<typeof chatBubblesQuerySchema>;

export const stickerGiphyQuerySchema = z.object({
  q: z
    .string()
    .max(STICKER_GIPHY_QUERY_MAX_LENGTH * 8)
    .optional(),
});
export type StickerGiphyQuery = z.infer<typeof stickerGiphyQuerySchema>;

export const dmThreadQuerySchema = z
  .object({ after: cursor.optional(), before: cursor.optional() })
  .refine(
    (value) => value.after === undefined || value.before === undefined,
    "after and before cannot be used together",
  );
export type DmThreadQuery = z.infer<typeof dmThreadQuerySchema>;

export const dmOpenRequestSchema = z.object({ otherId: positiveInt });
export type DmOpenRequest = z.infer<typeof dmOpenRequestSchema>;

// Sending is switched off; the body is validated only so a bad request still
// answers 400 before the 403.
export const dmSendRequestSchema = z.object({
  body: z
    .string()
    .max(CHAT_BODY_MAX_LENGTH * 2)
    .optional(),
  photoId: positiveInt.nullable().optional(),
  postId: positiveInt.nullable().optional(),
  clientId: z.string().trim().min(8).max(64).optional(),
});
export type DmSendRequest = z.infer<typeof dmSendRequestSchema>;

// --- Responses --------------------------------------------------------------

const stickerViewSchema = z.object({
  kind: z.enum(["pack", "giphy", "custom"]),
  url: z.string(),
  alt: z.string(),
});

const photoViewSchema = z.object({
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  alt: z.string(),
});

export const chatPostQuoteSchema = z.union([
  z.object({ id: z.number().int(), available: z.literal(false) }),
  z.object({
    id: z.number().int(),
    available: z.literal(true),
    authorName: z.string(),
    authorAvatarUrl: z.string().nullable(),
    caption: z.string(),
    photo: z
      .object({
        url: z.string(),
        width: z.number().int(),
        height: z.number().int(),
      })
      .nullable(),
  }),
]);

export const chatMessageViewSchema = z.object({
  id: z.number().int(),
  senderRole: z.enum(["user", "admin"]),
  senderAdminId: z.number().int().nullable(),
  // Null when the PT account was deleted afterwards.
  senderAdminName: z.string().nullable(),
  // Empty once the message was unsent.
  body: z.string(),
  sticker: stickerViewSchema.nullable(),
  photo: photoViewSchema.nullable(),
  clientId: z.string(),
  createdAt: iso,
  replyTo: z
    .object({
      id: z.number().int(),
      body: z.string(),
      isSticker: z.boolean(),
      isPhoto: z.boolean(),
      senderRole: z.enum(["user", "admin"]),
      deleted: z.boolean(),
    })
    .nullable(),
  editedAt: iso.nullable(),
  deleted: z.boolean(),
  // Last edit, unsend or reaction; createdAt before any of those.
  updatedAt: iso,
  reactions: z.array(
    z.object({
      emoji: z.string(),
      reactorKey: z.string(),
      reactorName: z.string(),
    }),
  ),
  post: chatPostQuoteSchema.nullable(),
});
export type ChatMessageView = z.infer<typeof chatMessageViewSchema>;

export const chatMessageResponseSchema = z.object({
  message: chatMessageViewSchema,
});

// Keys are "user", "pt" and "admin:<id>"; nicknames are the VIEWER's private
// contact aliases, colours are resolved (an admin's per-conversation override
// wins over their account colour).
export const chatProfileSchema = z.object({
  nicknames: z.record(z.string(), z.string()),
  colors: z.record(z.string(), z.enum(CHAT_COLOR_KEYS)),
});
export type ChatProfile = z.infer<typeof chatProfileSchema>;

export const chatThreadResponseSchema = z.object({
  messages: z.array(chatMessageViewSchema),
  hasMore: z.boolean(),
  // Messages edited, unsent or reacted to after `changedSince`.
  changes: z.array(chatMessageViewSchema),
  lastChangeAt: z.number().int(),
  profile: chatProfileSchema,
  chatEnabled: z.boolean(),
  // Highest message id the other side has read ("Đã xem").
  peerReadUpTo: z.number().int(),
  // ISO time of the other side's last heartbeat; null if never seen.
  peerLastSeenAt: z.string().nullable(),
  // Admin view only: the conversation's trainee.
  userId: z.number().int().optional(),
  // Null until the trainee's first message creates the conversation. The
  // realtime rooms are named after it.
  conversationId: z.number().int().nullable(),
  // The PT who wrote the newest admin message (the trainee's header and chat
  // info page); `name` is null once that account was deleted. Null before any
  // PT wrote.
  latestPt: z
    .object({ id: z.number().int().nullable(), name: z.string().nullable() })
    .nullable(),
});
export type ChatThreadResponse = z.infer<typeof chatThreadResponseSchema>;

export const chatEditsResponseSchema = z.object({
  edits: z.array(z.object({ previousBody: z.string(), editedAt: iso })),
});

export const chatReadResponseSchema = z.object({
  lastReadMessageId: z.number().int(),
});

// The PT team as the chat screens draw it: who has a photo and who has the blue
// tick (the PT team is small). Admins with neither are left out.
export const chatTeamResponseSchema = z.object({
  admins: z.array(
    z.object({
      id: z.number().int(),
      avatarUrl: z.string().nullable(),
      verified: z.boolean(),
    }),
  ),
});

export const chatEnabledResponseSchema = z.object({ enabled: z.boolean() });

export const chatProfileResponseSchema = z.object({
  profile: chatProfileSchema,
});

export const chatPhotoResponseSchema = z.object({
  photo: z.object({ id: z.number().int() }),
});

export const chatUnreadResponseSchema = z.union([
  z.object({
    count: z.number().int(),
    coachCount: z.number().int(),
    dmCount: z.number().int(),
    chatEnabled: z.boolean(),
    hasHistory: z.boolean(),
    latestLoudIncomingId: z.number().int().nullable(),
  }),
  z.object({
    count: z.number().int(),
    perTrainee: z.array(
      z.object({
        userId: z.number().int(),
        conversationId: z.number().int(),
        unread: z.number().int(),
        latestLoudIncomingId: z.number().int().nullable(),
      }),
    ),
  }),
]);

export const chatInboxItemSchema = z.object({
  conversationId: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  displayName: z.string(),
  chatEnabled: z.boolean(),
  preview: z.string(),
  lastFromAdmin: z.boolean(),
  lastSenderAdminId: z.number().int().nullable(),
  lastSenderAdminName: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  unread: z.number().int(),
  lastSeenAt: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const chatInboxResponseSchema = z.object({
  conversations: z.array(chatInboxItemSchema),
  // Trainees with chat on and no message yet.
  withoutConversation: z.array(
    z.object({
      userId: z.number().int(),
      userName: z.string(),
      lastSeenAt: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    }),
  ),
});

export const chatConversationResponseSchema = z.object({
  conversationId: z.number().int().nullable(),
  userId: z.number().int(),
  userName: z.string(),
  displayName: z.string(),
  chatEnabled: z.boolean(),
  avatarUrl: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  profile: chatProfileSchema,
});

export const chatBubblesResponseSchema = z.object({
  bubbles: z.array(
    z.object({
      userId: z.number().int(),
      conversationId: z.number().int(),
      name: z.string(),
      avatarUrl: z.string().nullable(),
      lastSeenAt: z.string().nullable(),
    }),
  ),
});

const snippetSchema = z.object({
  before: z.string(),
  match: z.string(),
  after: z.string(),
});

export const chatSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      messageId: z.number().int(),
      senderRole: z.enum(["user", "admin"]),
      senderAdminId: z.number().int().nullable(),
      senderName: z.string().nullable(),
      snippet: snippetSchema,
      createdAt: iso,
    }),
  ),
  nextCursor: z.number().int().nullable(),
});

const gallerySender = {
  messageId: z.number().int(),
  senderKey: z.string(),
  senderName: z.string(),
  createdAt: iso,
};

// One page of any gallery tab; the cursor is a message id for `before`.
export const chatGalleryResponseSchema = z.union([
  z.object({
    items: z.array(
      z.object({
        ...gallerySender,
        photoId: z.number().int(),
        url: z.string(),
        width: z.number().int(),
        height: z.number().int(),
      }),
    ),
    nextCursor: z.number().int().nullable(),
  }),
  z.object({
    items: z.array(
      z.object({
        ...gallerySender,
        url: z.string(),
        alt: z.string(),
        kind: z.enum(["pack", "giphy", "custom"]),
      }),
    ),
    nextCursor: z.number().int().nullable(),
  }),
  z.object({
    items: z.array(
      z.object({
        ...gallerySender,
        key: z.string(),
        href: z.string(),
        text: z.string(),
        domain: z.string(),
      }),
    ),
    nextCursor: z.number().int().nullable(),
  }),
]);

export const stickerCustomResponseSchema = z.object({
  sticker: z.object({ id: z.number().int(), url: z.string() }),
});

export const stickerCustomListResponseSchema = z.object({
  stickers: z.array(z.object({ id: z.number().int(), url: z.string() })),
});

export const stickerGiphyResponseSchema = z.object({
  enabled: z.boolean(),
  stickers: z.array(
    z.object({
      giphyId: z.string(),
      url: z.string(),
      previewUrl: z.string(),
      alt: z.string(),
    }),
  ),
});

export const dmMessageViewSchema = z.object({
  id: z.number().int(),
  senderId: z.number().int(),
  body: z.string().nullable(),
  photo: z
    .object({
      url: z.string(),
      width: z.number().int(),
      height: z.number().int(),
    })
    .nullable(),
  post: chatPostQuoteSchema.nullable(),
  clientId: z.string(),
  createdAt: iso,
});
export type DmMessageView = z.infer<typeof dmMessageViewSchema>;

export const dmThreadResponseSchema = z.object({
  messages: z.array(dmMessageViewSchema),
  // Ids (among the latest rows) that were unsent: the client drops them.
  deletedIds: z.array(z.number().int()),
  hasMore: z.boolean(),
  otherReadUpTo: z.number().int(),
  readOnlyReason: z.string().nullable(),
  isReadOnly: z.boolean(),
  // The two members' real names, only for a super admin reading the chat
  // (empty for a member); a deleted account has a null name.
  members: z.array(z.object({ id: z.number().int(), name: z.string().nullable() })),
});

export const dmInboxResponseSchema = z.object({
  conversations: z.array(
    z.object({
      conversationId: z.number().int(),
      otherId: z.number().int(),
      name: z.string(),
      avatarUrl: z.string().nullable(),
      preview: z.string(),
      lastMessageAt: z.string().nullable(),
      unread: z.number().int(),
    }),
  ),
});

export const dmAdminListResponseSchema = z.object({
  conversations: z.array(
    z.object({
      id: z.number().int(),
      lowName: z.string(),
      highName: z.string(),
      lastMessageAt: z.string().nullable(),
      preview: z.string(),
    }),
  ),
});

export const dmOpenResponseSchema = z.object({
  conversationId: z.number().int(),
});
