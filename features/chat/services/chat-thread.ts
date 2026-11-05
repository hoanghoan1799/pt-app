import "server-only";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  type ChatMessage,
  findConversationByUserId,
  getPeerReadCursor,
  listMessages,
  type ListMessagesOptions,
} from "@/features/chat/services/chat-queries";
import { getAdminTeamLastSeen } from "@/features/chat/services/presence";
import { serializeLastSeen } from "@/features/chat/utils/presence";

export interface ThreadPayload {
  messages: ChatMessage[];
  hasMore: boolean;
  chatEnabled: boolean;
  // Highest message id the other side has read ("Đã xem").
  peerReadUpTo: number;
  // Newest heartbeat across all PTs as an ISO string, null if never seen.
  // Only on full payloads: the 204 fast path carries no presence, the client
  // refreshes it via GET /api/presence/peer.
  peerLastSeenAt: string | null;
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
      payload: {
        messages: [],
        hasMore: false,
        chatEnabled,
        peerReadUpTo: 0,
        peerLastSeenAt: serializeLastSeen(await getAdminTeamLastSeen()),
      },
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
  const [{ messages, hasMore }, teamLastSeen] = await Promise.all([
    listMessages(conversation.id, query),
    getAdminTeamLastSeen(),
  ]);

  return {
    notModified: false,
    payload: {
      messages,
      hasMore,
      chatEnabled,
      peerReadUpTo,
      peerLastSeenAt: serializeLastSeen(teamLastSeen),
    },
  };
};
