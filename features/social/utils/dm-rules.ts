import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { PHOTO_PREVIEW } from "@/features/chat/utils/photo-rules";
import type { ChatPushPayload } from "@/features/chat/utils/push-rules";
import {
  DM_BODY_MAX_LENGTH,
  DM_MESSAGES,
} from "@/features/social/constants/dm";
import { SOCIAL_MESSAGES } from "@/features/social/constants/social";
import type { SocialActor } from "@/features/social/types/social";

// Pure rules of the trainee-to-trainee chat (P5). No database in here.

export const dmPath = (conversationId: number) =>
  `${ROUTES.MESSAGES_DM}/${conversationId}`;

export const dmPhotoUrl = (photoId: number) => `/api/dm/photos/${photoId}`;

export const dmIdSchema = z.number().int().positive();

export const parseDmId = (value: string) =>
  /^[1-9]\d{0,14}$/.test(value) ? Number(value) : null;

export const dmClientIdSchema = z.string().trim().min(8).max(64);

export const dmSendSchema = z.object({
  conversationId: dmIdSchema,
  clientId: dmClientIdSchema,
  body: z
    .string()
    .max(DM_BODY_MAX_LENGTH * 2)
    .optional()
    .default(""),
  photoId: dmIdSchema.nullable().optional().default(null),
});

export type DmSendInput = z.infer<typeof dmSendSchema>;

// Text and/or one photo; the text is trimmed and capped.
export const checkDmContent = (
  body: string,
  photoId: number | null,
): { ok: true; body: string | null } | { ok: false; message: string } => {
  const text = body.trim();

  if (text.length > DM_BODY_MAX_LENGTH) {
    return { ok: false, message: DM_MESSAGES.TOO_LONG };
  }
  if (text === "" && photoId === null) {
    return { ok: false, message: DM_MESSAGES.EMPTY };
  }
  return { ok: true, body: text === "" ? null : text };
};

export interface SendState {
  // Both sides are accepted friends and nobody blocked the other.
  areFriends: boolean;
  isBlocked: boolean;
  viewerAcceptedTerms: boolean;
  otherAcceptedTerms: boolean;
}

// null = may send; otherwise why the conversation is read-only (A7).
export const sendBlockReason = (state: SendState): string | null => {
  if (state.isBlocked || !state.areFriends) {
    return DM_MESSAGES.READ_ONLY;
  }
  if (!state.viewerAcceptedTerms) {
    return SOCIAL_MESSAGES.TERMS_REQUIRED;
  }
  return state.otherAcceptedTerms ? null : DM_MESSAGES.READ_ONLY_OTHER_TERMS;
};

// Who may open a conversation (Q6): its two members, unless one blocked the
// other (then it is hidden); a super admin read-only; a PT never.
export type DmAccess = "member" | "readonly_admin" | "none";

export const dmAccessOf = (
  viewer: SocialActor,
  members: { low: number; high: number },
  isBlocked: boolean,
): DmAccess => {
  if (viewer.kind === "admin") {
    return viewer.role === "super_admin" ? "readonly_admin" : "none";
  }
  const isMember = viewer.id === members.low || viewer.id === members.high;

  return isMember && !isBlocked ? "member" : "none";
};

export const otherMember = (
  members: { low: number; high: number },
  userId: number,
) => (members.low === userId ? members.high : members.low);

// Lock-screen privacy like the coach chat: the sender's name and the kind of
// message, never the text.
export const buildDmPushPayload = ({
  senderName,
  conversationId,
  photo,
}: {
  senderName: string;
  conversationId: number;
  photo: boolean;
}): ChatPushPayload => ({
  title: "PT App",
  body: photo
    ? `${senderName}: ${PHOTO_PREVIEW}`
    : `${senderName} vừa nhắn tin`,
  url: dmPath(conversationId),
  tag: `dm-${conversationId}`,
});

// Inbox preview line.
export const dmPreview = (message: {
  body: string | null;
  photoId: number | null;
  deleted: boolean;
}) => {
  if (message.deleted) {
    return DM_MESSAGES.UNSENT;
  }
  if (message.photoId !== null) {
    return message.body ? `${PHOTO_PREVIEW} ${message.body}` : PHOTO_PREVIEW;
  }
  return message.body ?? "";
};
