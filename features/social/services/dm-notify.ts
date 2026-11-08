import "server-only";

import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";
import {
  deliver,
  getVapid,
  type PushSender,
  sendWithWebPush,
} from "@/features/chat/services/chat-push";
import { publishChatEvent } from "@/features/chat/services/chat-realtime";
import {
  DM_EVENTS,
  dmConversationChannel,
  dmEvent,
} from "@/features/chat/utils/ably-capabilities";
import { userOwnerKey } from "@/features/chat/utils/push-rules";
import { buildDmPushPayload } from "@/features/social/utils/dm-rules";
import { logServerError } from "@/services/logger";

// Realtime and push for trainee chats. Both are best effort and never throw:
// the database is the source of truth and the thread polls every 5 s anyway.

export const publishDmEvent = async (
  kind: keyof typeof DM_EVENTS,
  conversationId: number,
  messageId: number,
  senderId: number,
) => {
  try {
    await publishChatEvent(
      dmConversationChannel(conversationId),
      DM_EVENTS[kind],
      dmEvent(conversationId, messageId, senderId),
    );
  } catch (error) {
    logServerError("publishDmEvent", error, { conversationId });
  }
};

export interface SendDmPushInput {
  senderId: number;
  recipientId: number;
  conversationId: number;
  photo: boolean;
}

// The other member's devices; the body is the sender's name and "📷 Ảnh" for a
// photo, never the text. Skipped without VAPID keys.
export const sendDmPush = async (
  { senderId, recipientId, conversationId, photo }: SendDmPushInput,
  sender: PushSender = sendWithWebPush,
) => {
  try {
    const vapid = getVapid();

    if (!vapid) {
      return;
    }
    const targets = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ownerKey, userOwnerKey(recipientId)));

    if (targets.length === 0) {
      return;
    }
    const [person] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    await deliver(
      targets,
      buildDmPushPayload({
        senderName: person?.name ?? "Bạn bè",
        conversationId,
        photo,
      }),
      vapid,
      sender,
    );
  } catch (error) {
    logServerError("sendDmPush", error, { conversationId });
  }
};

export const scheduleDmPush = (input: SendDmPushInput) => {
  try {
    after(() => sendDmPush(input));
  } catch {
    void sendDmPush(input);
  }
};
