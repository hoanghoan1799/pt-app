import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { getAdminMessagesPath } from "@/utils/routes";

export type PushRecipientRole = "user" | "admin";

export const userOwnerKey = (userId: number) => `user:${userId}`;
export const ADMIN_OWNER_PREFIX = "admin:";
export const adminOwnerKey = (adminId: number) =>
  `${ADMIN_OWNER_PREFIX}${adminId}`;

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

// Shape of PushSubscription.toJSON() as the browser produces it.
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(MAX_ENDPOINT_LENGTH)
    .url()
    .refine((value) => value.startsWith("https://"), "https only"),
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
export const PUSH_BODY_TO_TRAINEE = "Bạn có tin nhắn mới từ PT";

// Lock-screen privacy (spec section 7): the payload never carries the message
// body, and this function deliberately cannot accept one.
export const buildChatPushPayload = ({
  recipientRole,
  traineeName,
  traineeUserId,
  conversationId,
}: {
  recipientRole: PushRecipientRole;
  traineeName: string;
  traineeUserId: number;
  conversationId: number;
}): ChatPushPayload => ({
  title: PUSH_TITLE,
  body:
    recipientRole === "user"
      ? PUSH_BODY_TO_TRAINEE
      : `${traineeName} vừa nhắn tin`,
  url:
    recipientRole === "user"
      ? ROUTES.MESSAGES
      : getAdminMessagesPath(traineeUserId),
  // One notification per conversation: a newer one replaces the older.
  tag: `chat-${conversationId}`,
});

// The push service says the subscription is dead for good.
export const isGoneStatus = (statusCode: number | undefined) =>
  statusCode === 404 || statusCode === 410;
