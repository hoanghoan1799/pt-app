import "server-only";

import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";
import {
  deliverLocalized,
  getVapid,
  type PushSender,
  sendWithWebPush,
} from "@/features/chat/services/chat-push";
import { userOwnerKey } from "@/features/chat/utils/push-rules";
import { loadAliases } from "@/features/contact-aliases/services/contact-aliases";
import { userActorKey } from "@/features/contact-aliases/utils/alias-rules";
import { buildDmPushPayload } from "@/features/social/utils/dm-rules";
import { getPushTranslator } from "@/i18n/push-translator";
import { logServerError } from "@/services/logger";

// Push for trainee chats; best effort and never throws. (Realtime events are
// sent by the API.)

export interface SendDmPushInput {
  senderId: number;
  recipientId: number;
  conversationId: number;
  body: string | null;
  photo: boolean;
}

// The other member's devices; the title is the sender's name and the body a
// preview of the text (a kind label for a photo or link). Never logged.
// Skipped without VAPID keys.
export const sendDmPush = async (
  { senderId, recipientId, conversationId, body, photo }: SendDmPushInput,
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

    // The recipient's own nickname for the sender wins over the real name.
    const alias = (
      await loadAliases(userActorKey(recipientId), [userActorKey(senderId)])
    )
      .get(userActorKey(senderId))
      ?.trim();

    await deliverLocalized(
      targets,
      (locale) =>
        buildDmPushPayload({
          senderName:
            alias ||
            person?.name ||
            getPushTranslator(locale)("friendFallback"),
          conversationId,
          body,
          photo,
          locale,
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
