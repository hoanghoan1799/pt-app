import "server-only";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  type ChatProfile,
  EMPTY_CHAT_PROFILE,
  loadChatProfile,
} from "@/features/chat/services/chat-profile";
import {
  type ChatMessage,
  findConversationByUserId,
  findStoredMessage,
  getPeerReadCursor,
  listChanges,
  listEditHistory,
  listMessages,
  type ListMessagesOptions,
} from "@/features/chat/services/chat-queries";
import { getAdminTeamLastSeen } from "@/features/chat/services/presence";
import { serializeLastSeen } from "@/features/chat/utils/presence";
import { actorOfUser } from "@/features/social/services/post-context";
import type { SocialActor } from "@/features/social/types/social";

export interface ThreadPayload {
  messages: ChatMessage[];
  hasMore: boolean;
  // Messages edited, unsent or reacted to after `changedSince` (empty when
  // the client did not send it) and the cursor to send next time.
  changes: ChatMessage[];
  lastChangeAt: number;
  // Nicknames and bubble colours (KAN-141). Always on a full payload; any
  // change bumps the change cursor, so the 204 fast path never hides it.
  profile: ChatProfile;
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
// `changedSince` (KAN-138) is the newest change cursor the client holds; a
// client that does not send it (an old tab) keeps the previous 204 rule.
export interface KnownState {
  readUpTo?: number;
  enabled?: boolean;
  changedSince?: number;
}

// Shared by both thread routes. Without `changedSince` nothing is queried and
// the cursor is still reported, so a client can start tracking from it.
export const loadChanges = async (
  conversationId: number,
  changedSince: number | undefined,
  lastChangeAt: number,
  viewer?: SocialActor,
) =>
  changedSince === undefined
    ? { changes: [] as ChatMessage[], lastChangeAt }
    : listChanges(conversationId, changedSince, lastChangeAt, viewer);

// Edit history is visible to everyone in the conversation (spec C4). Null =
// no such message here; an unsent message shows no history.
export const loadEditHistory = async (
  conversationId: number,
  messageId: number,
) => {
  const stored = await findStoredMessage(messageId);

  if (!stored || stored.conversationId !== conversationId) {
    return null;
  }
  return stored.deletedAt ? [] : listEditHistory(messageId);
};

export const loadTraineeThread = async (
  user: { id: number; chatEnabled: boolean | null },
  query: ListMessagesOptions,
  known: KnownState,
): Promise<
  { notModified: true } | { notModified: false; payload: ThreadPayload }
> => {
  const chatEnabled = isChatEnabled(user);
  const viewer = actorOfUser(user);
  const conversation = await findConversationByUserId(user.id);

  if (!conversation) {
    return {
      notModified: false,
      payload: {
        messages: [],
        hasMore: false,
        changes: [],
        lastChangeAt: 0,
        profile: EMPTY_CHAT_PROFILE,
        chatEnabled,
        peerReadUpTo: 0,
        peerLastSeenAt: serializeLastSeen(await getAdminTeamLastSeen()),
      },
    };
  }
  const peerReadUpTo = await getPeerReadCursor(conversation.id, "user");
  const lastChangeAt = conversation.lastChangeAt?.getTime() ?? 0;

  if (
    query.after !== undefined &&
    query.after >= (conversation.lastMessageId ?? 0) &&
    known.readUpTo === peerReadUpTo &&
    known.enabled === chatEnabled &&
    (known.changedSince === undefined || lastChangeAt <= known.changedSince)
  ) {
    return { notModified: true };
  }
  const [{ messages, hasMore }, changed, teamLastSeen, profile] =
    await Promise.all([
      listMessages(conversation.id, query, viewer),
      loadChanges(conversation.id, known.changedSince, lastChangeAt, viewer),
      getAdminTeamLastSeen(),
      loadChatProfile(conversation.id),
    ]);

  return {
    notModified: false,
    payload: {
      messages,
      hasMore,
      ...changed,
      profile,
      chatEnabled,
      peerReadUpTo,
      peerLastSeenAt: serializeLastSeen(teamLastSeen),
    },
  };
};
