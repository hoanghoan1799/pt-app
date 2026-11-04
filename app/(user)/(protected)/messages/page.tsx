import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { ChatThread } from "@/features/chat/components/ChatThread";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  findConversationByUserId,
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

  // Chat is off and there is nothing to read: the tab is hidden, so is this.
  if (!chatEnabled && existing?.lastMessageId == null) {
    redirect(ROUTES.WORKOUTS);
  }
  // The realtime token is scoped to the conversation, so make sure it exists.
  const conversation =
    existing ?? (chatEnabled ? await getOrCreateConversation(user.id) : null);
  const result = await loadTraineeThread(user, {}, {});

  if (result.notModified) {
    // Unreachable without `after`; keeps the type honest.
    redirect(ROUTES.WORKOUTS);
  }
  const { payload } = result;

  return (
    <ChatThread
      header={<AppHeader title="PT của bạn" />}
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
