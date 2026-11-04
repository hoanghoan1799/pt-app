import "server-only";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  type ChatMessage,
  findConversationByUserId,
  getPeerReadCursor,
  listMessages,
  type ListMessagesOptions,
} from "@/features/chat/services/chat-queries";

export interface ThreadPayload {
  messages: ChatMessage[];
  hasMore: boolean;
  chatEnabled: boolean;
  // Highest message id the other side has read ("Đã xem").
  peerReadUpTo: number;
}

// What the polling client already knows. Only when `after`, `readUpTo` and
// `enabled` are all sent AND still current is "nothing changed" (204) a valid
// answer; otherwise the full payload goes out so lock changes and "Đã xem"
// updates are never missed.
export interface KnownState {
  readUpTo?: number;
  enabled?: boolean;
}

export const loadTraineeThread = async (
  user: { id: number; chatEnabled: boolean | null },
  query: ListMessagesOptions,
  known: KnownState,
): Promise<
  { notModified: true } | { notModified: false; payload: ThreadPayload }
> => {
  const chatEnabled = isChatEnabled(user);
  const conversation = await findConversationByUserId(user.id);

  if (!conversation) {
    return {
      notModified: false,
      payload: { messages: [], hasMore: false, chatEnabled, peerReadUpTo: 0 },
    };
  }
  const peerReadUpTo = await getPeerReadCursor(conversation.id, "user");

  if (
    query.after !== undefined &&
    query.after >= (conversation.lastMessageId ?? 0) &&
    known.readUpTo === peerReadUpTo &&
    known.enabled === chatEnabled
  ) {
    return { notModified: true };
  }
  const { messages, hasMore } = await listMessages(conversation.id, query);

  return {
    notModified: false,
    payload: { messages, hasMore, chatEnabled, peerReadUpTo },
  };
};
