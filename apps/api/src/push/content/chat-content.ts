import { chatExtractUrls, type PushPayload } from "@pt/contracts";

import {
  DEFAULT_LOCALE,
  type Locale,
} from "../../social/notifications/notification-content.js";

// The wording of chat pushes, ported from the web (messages/{vi,en,zh}/push.json
// and features/chat/utils/push-rules.ts). The text is the RECIPIENT's language.

const TEXTS = {
  vi: {
    photo: "Đã gửi ảnh",
    sticker: "Đã gửi sticker",
    link: "Đã gửi liên kết",
    fallback: "Đã gửi tin nhắn",
    reaction: "{name} đã thả {emoji} vào tin nhắn của bạn",
    traineeFallback: "Học viên",
  },
  en: {
    photo: "Sent a photo",
    sticker: "Sent a sticker",
    link: "Sent a link",
    fallback: "Sent a message",
    reaction: "{name} reacted {emoji} to your message",
    traineeFallback: "Trainee",
  },
  zh: {
    photo: "发送了一张照片",
    sticker: "发送了一个贴纸",
    link: "发送了一个链接",
    fallback: "发送了一条消息",
    reaction: "{name} 对你的消息回应了 {emoji}",
    traineeFallback: "学员",
  },
} as const;

export const PUSH_TITLE = "PT App";
export const PUSH_PREVIEW_MAX_LENGTH = 500;
// What a trainee's push calls a PT whose name is unknown.
export const PT_FALLBACK_NAME = "PT";

export const traineeFallbackName = (locale: Locale) =>
  TEXTS[locale].traineeFallback;

export type PushRecipientRole = "user" | "admin";

// Where a push opens, as the web routes: the trainee's coach chat, or the
// admin's thread with that trainee.
export const COACH_CHAT_PATH = "/messages/coach";
export const adminThreadPath = (traineeUserId: number) =>
  `/admin/users/${traineeUserId}/messages`;

const pathFor = (role: PushRecipientRole, traineeUserId: number) =>
  role === "user" ? COACH_CHAT_PATH : adminThreadPath(traineeUserId);

// A message that is only links reads as a kind label, not as the URLs.
const isLinkOnly = (text: string) => {
  const urls = chatExtractUrls(text);

  if (urls.length === 0) {
    return false;
  }
  return (
    urls.reduce((rest, url) => rest.split(url.text).join(""), text).trim() ===
    ""
  );
};

// The notification text: a kind label for a photo, sticker or link-only
// message, otherwise the message itself (line breaks kept, runs of spaces
// collapsed, 3+ line breaks become 2), cut at 500 characters (counted by code
// points so an emoji is never split).
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
  const t = TEXTS[locale];

  if (photo) {
    return t.photo;
  }
  if (sticker) {
    return t.sticker;
  }
  const text = (body ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text === "") {
    return t.fallback;
  }
  if (isLinkOnly(text)) {
    return t.link;
  }
  const chars = Array.from(text);

  return chars.length > PUSH_PREVIEW_MAX_LENGTH
    ? `${chars
        .slice(0, PUSH_PREVIEW_MAX_LENGTH - 1)
        .join("")
        .trimEnd()}…`
    : text;
};

export type ChatMessageFacts = {
  recipientRole: PushRecipientRole;
  // The sender as the recipient calls them (their nickname, else the real name).
  senderName: string;
  traineeUserId: number;
  conversationId: number;
  body?: string | null;
  sticker?: boolean;
  photo?: boolean;
  locale?: Locale;
};

export const buildChatMessagePush = ({
  recipientRole,
  senderName,
  traineeUserId,
  conversationId,
  body,
  sticker = false,
  photo = false,
  locale = DEFAULT_LOCALE,
}: ChatMessageFacts): PushPayload => ({
  title: senderName.trim() === "" ? PUSH_TITLE : senderName,
  body: buildPushPreview({ body, sticker, photo, locale }),
  url: pathFor(recipientRole, traineeUserId),
  // One notification per conversation: a newer one replaces the older.
  tag: `chat-${conversationId}`,
});

export type ChatReactionFacts = {
  recipientRole: PushRecipientRole;
  reactorName: string;
  emoji: string;
  traineeUserId: number;
  conversationId: number;
  locale?: Locale;
};

// Who reacted and with what, never the text of the message. Its own tag, so it
// does not replace a pending "new message" notification.
export const buildChatReactionPush = ({
  recipientRole,
  reactorName,
  emoji,
  traineeUserId,
  conversationId,
  locale = DEFAULT_LOCALE,
}: ChatReactionFacts): PushPayload => ({
  title: PUSH_TITLE,
  body: TEXTS[locale].reaction
    .replaceAll("{name}", reactorName)
    .replaceAll("{emoji}", emoji),
  url: pathFor(recipientRole, traineeUserId),
  tag: `chat-react-${conversationId}`,
});
