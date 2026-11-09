import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { photoPreview } from "@/features/chat/utils/photo-rules";
import {
  buildPushPreview,
  type ChatPushPayload,
  PUSH_TITLE,
} from "@/features/chat/utils/push-rules";
import {
  DM_BODY_MAX_LENGTH,
  DM_MESSAGES,
} from "@/features/social/constants/dm";
import type { SocialActor } from "@/features/social/types/social";
import { localizeMessageFor } from "@/i18n/localize-message";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

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
  // The post being replied to (a text is required then).
  postId: dmIdSchema.nullable().optional().default(null),
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

// Owner decision 2026-11-09: trainee-to-trainee chat is turned off. Old
// conversations stay readable (and a member can unsend), but nobody can send.
export const sendBlockReason = (): string => DM_MESSAGES.DISABLED;

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

// Owner request (2026-11-09): the sender's name as the title and a preview of
// the message (or its kind) as the body.
export const buildDmPushPayload = ({
  senderName,
  conversationId,
  body,
  photo,
  locale = DEFAULT_LOCALE,
}: {
  senderName: string;
  conversationId: number;
  body?: string | null;
  photo: boolean;
  // The recipient's language.
  locale?: Locale;
}): ChatPushPayload => ({
  title: senderName.trim() === "" ? PUSH_TITLE : senderName,
  body: buildPushPreview({ body, photo, locale }),
  url: dmPath(conversationId),
  tag: `dm-${conversationId}`,
});

// Inbox preview line.
export const dmPreview = (
  message: {
    body: string | null;
    photoId: number | null;
    deleted: boolean;
  },
  locale: Locale = DEFAULT_LOCALE,
) => {
  if (message.deleted) {
    return localizeMessageFor(locale, DM_MESSAGES.UNSENT);
  }
  if (message.photoId !== null) {
    const label = photoPreview("", locale);

    return message.body ? `${label} ${message.body}` : label;
  }
  return message.body ?? "";
};
