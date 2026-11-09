import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { extractUrls, tokenizeLinks } from "@/features/chat/utils/link-rules";
import { getPushTranslator } from "@/i18n/push-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";
import { getAdminMessagesPath } from "@/utils/routes";

export type PushRecipientRole = "user" | "admin";

export const userOwnerKey = (userId: number) => `user:${userId}`;
export const ADMIN_OWNER_PREFIX = "admin:";
export const adminOwnerKey = (adminId: number) =>
  `${ADMIN_OWNER_PREFIX}${adminId}`;

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

// The server POSTs to the endpoint on every chat message, so only the
// browsers' push services are accepted (no SSRF to internal or arbitrary
// hosts). Exact host or a subdomain of it, default https port only.
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.apple.com",
  "notify.windows.com",
  "push.services.mozilla.com",
];

export const isAllowedPushEndpoint = (value: string) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username) {
    return false;
  }
  const host = url.hostname.toLowerCase();

  return PUSH_SERVICE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
};

// Shape of PushSubscription.toJSON() as the browser produces it.
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(MAX_ENDPOINT_LENGTH)
    .url()
    .refine(isAllowedPushEndpoint, "unknown push service"),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(MAX_KEY_LENGTH),
    auth: z.string().trim().min(1).max(MAX_KEY_LENGTH),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribeSchema = z.object({
  endpoint: z.string().max(MAX_ENDPOINT_LENGTH).min(1),
});

export interface ChatPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export const PUSH_TITLE = "PT App";
export const PUSH_PREVIEW_MAX_LENGTH = 500;
export const PUSH_PREVIEW_PHOTO = "Đã gửi ảnh";
export const PUSH_PREVIEW_STICKER = "Đã gửi sticker";
export const PUSH_PREVIEW_LINK = "Đã gửi liên kết";
export const PUSH_PREVIEW_FALLBACK = "Đã gửi tin nhắn";

// The notification text: a kind label for a photo, sticker or link-only
// message, otherwise the message itself (line breaks kept, runs of spaces
// collapsed, 3+ line breaks become 2), cut at 500 characters (counted by code
// points so an emoji is never split). The OS shortens the collapsed view and
// shows the full text on long-press.
export const buildPushPreview = ({
  body,
  sticker = false,
  photo = false,
  locale = DEFAULT_LOCALE,
}: {
  body?: string | null;
  sticker?: boolean;
  photo?: boolean;
  locale?: Locale;
}): string => {
  const t = getPushTranslator(locale);

  if (photo) {
    return t("preview.photo");
  }
  if (sticker) {
    return t("preview.sticker");
  }
  const text = (body ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text === "") {
    return t("preview.fallback");
  }
  if (
    extractUrls(text).length > 0 &&
    tokenizeLinks(text).every(
      (token) => token.kind === "link" || token.text.trim() === "",
    )
  ) {
    return t("preview.link");
  }
  const chars = Array.from(text);

  return chars.length > PUSH_PREVIEW_MAX_LENGTH
    ? `${chars
        .slice(0, PUSH_PREVIEW_MAX_LENGTH - 1)
        .join("")
        .trimEnd()}…`
    : text;
};

// Owner request (Hoan, 2026-11-09): the push shows the sender's name and a
// preview of the message, replacing the earlier lock-screen-private text. The
// body is only ever put in the payload; it is never logged.
export const buildChatPushPayload = ({
  recipientRole,
  senderName,
  traineeUserId,
  conversationId,
  body,
  sticker = false,
  photo = false,
  locale = DEFAULT_LOCALE,
}: {
  recipientRole: PushRecipientRole;
  senderName: string;
  traineeUserId: number;
  conversationId: number;
  body?: string | null;
  sticker?: boolean;
  photo?: boolean;
  // The recipient's language.
  locale?: Locale;
}): ChatPushPayload => ({
  title: senderName.trim() === "" ? PUSH_TITLE : senderName,
  body: buildPushPreview({ body, sticker, photo, locale }),
  url:
    recipientRole === "user"
      ? ROUTES.MESSAGES_COACH
      : getAdminMessagesPath(traineeUserId),
  // One notification per conversation: a newer one replaces the older.
  tag: `chat-${conversationId}`,
});

// Reaction push (KAN-138, C7): who reacted and with what, never the text of
// the message that was reacted to. Its own tag, so it does not replace a
// pending "new message" notification.
export const buildReactionPushPayload = ({
  recipientRole,
  reactorName,
  emoji,
  traineeUserId,
  conversationId,
  locale = DEFAULT_LOCALE,
}: {
  recipientRole: PushRecipientRole;
  reactorName: string;
  emoji: string;
  traineeUserId: number;
  conversationId: number;
  locale?: Locale;
}): ChatPushPayload => ({
  title: PUSH_TITLE,
  body: getPushTranslator(locale)("reaction", { name: reactorName, emoji }),
  url:
    recipientRole === "user"
      ? ROUTES.MESSAGES_COACH
      : getAdminMessagesPath(traineeUserId),
  tag: `chat-react-${conversationId}`,
});

// The push service says the subscription is dead for good.
export const isGoneStatus = (statusCode: number | undefined) =>
  statusCode === 404 || statusCode === 410;
