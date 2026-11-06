import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { TraineeChatThread } from "@/features/chat/components/TraineeChatThread";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  findConversationByUserId,
  findLatestAdminSenderName,
  getOrCreateConversation,
} from "@/features/chat/services/chat-queries";
import { loadTraineeThread } from "@/features/chat/services/chat-thread";
import { serializeMessage } from "@/features/chat/utils/chat-thread-rules";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Nhắn tin" };

const MessagesPage = async () => {
  const user = await requireUser();
  const chatEnabled = isChatEnabled(user);
  const existing = await findConversationByUserId(user.id);

  // Chat off: the thread opens read-only (old messages, if any, and the
  // locked banner); no conversation is created for it.
  // The realtime token is scoped to the conversation, so make sure it exists.
  const conversation =
    existing ?? (chatEnabled ? await getOrCreateConversation(user.id) : null);
  const result = await loadTraineeThread(user, {}, {});

  if (result.notModified) {
    // Unreachable without `after`; keeps the type honest.
    redirect(ROUTES.WORKOUTS);
  }
  const { payload } = result;
  const peerName = existing
    ? await findLatestAdminSenderName(existing.id)
    : null;

  return (
    <TraineeChatThread
      initialPeerName={peerName}
      userId={user.id}
      conversationId={conversation?.id ?? null}
      initial={{
        ...payload,
        messages: payload.messages.map(serializeMessage),
      }}
    />
  );
};

export default MessagesPage;
