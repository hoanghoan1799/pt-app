import "server-only";

import type {
  ChatMessageView,
  ChatThreadQuery,
  ChatThreadResponse,
} from "@pt/contracts";

import { webizeUrls } from "@/features/chat/utils/api-urls";
import { callApi, runApi } from "@/services/api/call";

// What the chat pages read from the API. Message and thread shapes are the
// API's own (`@pt/contracts`); file paths are mapped to this app's `/api/...`
// proxies so the browser never needs the API's address.

export type ChatMessage = ChatMessageView;
export type ChatReaction = ChatMessage["reactions"][number];
export type ChatReplyTo = NonNullable<ChatMessage["replyTo"]>;
export type ThreadPayload = ChatThreadResponse;

export interface InboxItem {
  conversationId: number;
  userId: number;
  userName: string;
  // This admin's private nickname for the trainee, else the real name.
  displayName: string;
  chatEnabled: boolean;
  preview: string;
  lastFromAdmin: boolean;
  lastSenderAdminId: number | null;
  lastSenderAdminName: string | null;
  lastMessageAt: Date | null;
  unread: number;
  lastSeenAt: Date | null;
  avatarUrl: string | null;
}

export interface InboxWithoutConversation {
  userId: number;
  userName: string;
  lastSeenAt: Date | null;
  avatarUrl: string | null;
}

const toDate = (value: string | null) =>
  value === null ? null : new Date(value);

type ApiInbox = {
  conversations: (Omit<InboxItem, "lastMessageAt" | "lastSeenAt"> & {
    lastMessageAt: string | null;
    lastSeenAt: string | null;
  })[];
  withoutConversation: (Omit<InboxWithoutConversation, "lastSeenAt"> & {
    lastSeenAt: string | null;
  })[];
};

export const toInbox = (raw: ApiInbox) => {
  const data = webizeUrls(raw);

  return {
    conversations: data.conversations.map((item): InboxItem => ({
      ...item,
      lastMessageAt: toDate(item.lastMessageAt),
      lastSeenAt: toDate(item.lastSeenAt),
    })),
    withoutConversation: data.withoutConversation.map(
      (item): InboxWithoutConversation => ({
        ...item,
        lastSeenAt: toDate(item.lastSeenAt),
      }),
    ),
  };
};

export const listAdminInbox = async () =>
  toInbox(
    await callApi("admin", (api) =>
      api.GET("/v1/chat/inbox", { params: { query: {} } }),
    ),
  );

// This admin's hidden trainees; empty unless the session revealed them.
export const listHiddenInboxForAdmin = async () =>
  toInbox(
    await callApi("admin", (api) =>
      api.GET("/v1/chat/inbox", { params: { query: { hidden: "1" } } }),
    ),
  );

const toQuery = (query: Partial<ChatThreadQuery>) => ({
  ...query,
  enabled: query.enabled === undefined ? undefined : query.enabled ? "1" : "0",
});

// The trainee's own thread. `around` opens it at a message (a jump); no cursor
// is the newest page. Never 204 without the polling state.
export const loadMyThread = async (
  query: Partial<ChatThreadQuery> = {},
): Promise<ThreadPayload> =>
  webizeUrls(
    (await callApi("user", (api) =>
      api.GET("/v1/chat/conversations/me/messages", {
        params: { query: toQuery(query) as never },
      }),
    )) as ThreadPayload,
  );

// The thread opened at a message (a jump from the gallery or a search result):
// null when that message is not in this conversation or too far back, so the
// chat just opens at the newest as usual.
export const loadMyThreadAround = async (
  messageId: number,
): Promise<ThreadPayload | null> => {
  const outcome = await runApi("user", (api) =>
    api.GET("/v1/chat/conversations/me/messages", {
      params: { query: { around: messageId } },
    }),
  );

  return outcome.ok ? webizeUrls(outcome.data as ThreadPayload) : null;
};

export const loadConversationThreadAround = async (
  conversationId: number,
  messageId: number,
): Promise<ThreadPayload | null> => {
  const outcome = await runApi("admin", (api) =>
    api.GET("/v1/chat/conversations/{cid}/messages", {
      params: { path: { cid: conversationId }, query: { around: messageId } },
    }),
  );

  return outcome.ok ? webizeUrls(outcome.data as ThreadPayload) : null;
};

// Nicknames, colours and the chat switch without the messages.
export const loadMyChatState = () => loadMyThread({ after: 2_000_000_000 });

export const loadConversationThread = async (
  conversationId: number,
  query: Partial<ChatThreadQuery> = {},
): Promise<ThreadPayload> =>
  webizeUrls(
    (await callApi("admin", (api) =>
      api.GET("/v1/chat/conversations/{cid}/messages", {
        params: {
          path: { cid: conversationId },
          query: toQuery(query) as never,
        },
      }),
    )) as ThreadPayload,
  );

export type TraineeChatHeader = {
  conversationId: number | null;
  userId: number;
  userName: string;
  displayName: string;
  chatEnabled: boolean;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  profile: ThreadPayload["profile"];
};

// The admin's view of one trainee's chat; null when the trainee is not
// visible to this admin (out of workspace, hidden and not revealed).
export const findTraineeChatHeader = async (
  userId: number,
): Promise<TraineeChatHeader | null> => {
  const outcome = await runApi("admin", (api) =>
    api.GET("/v1/chat/trainees/{userId}/conversation", {
      params: { path: { userId } },
    }),
  );

  if (outcome.ok) {
    return webizeUrls(outcome.data) as TraineeChatHeader;
  }
  if (outcome.error.status === 404) {
    return null;
  }
  throw outcome.error;
};

export const findConversationHeader = async (
  conversationId: number,
): Promise<TraineeChatHeader | null> => {
  const outcome = await runApi("admin", (api) =>
    api.GET("/v1/chat/conversations/{cid}", {
      params: { path: { cid: conversationId } },
    }),
  );

  if (outcome.ok) {
    return webizeUrls(outcome.data) as TraineeChatHeader;
  }
  if (outcome.error.status === 404) {
    return null;
  }
  throw outcome.error;
};

// The name admin pages show for one trainee to this admin: their private
// nickname if they set one, else the real name.
export const getTraineeDisplayName = async (
  _adminId: number,
  user: { id: number; name: string },
) => (await findTraineeChatHeader(user.id))?.displayName ?? user.name;

export const loadUserUnread = async () => {
  const data = await callApi("user", (api) => api.GET("/v1/chat/unread"));

  return data as {
    count: number;
    coachCount: number;
    dmCount: number;
    chatEnabled: boolean;
    hasHistory: boolean;
    latestLoudIncomingId: number | null;
  };
};

export const loadAdminUnread = async () => {
  const data = await callApi("admin", (api) => api.GET("/v1/chat/unread"));

  return data as {
    count: number;
    perTrainee: {
      userId: number;
      conversationId: number;
      unread: number;
      latestLoudIncomingId: number | null;
    }[];
  };
};

// Whether the signed-in trainee has a conversation with the PT team yet (any
// message either way); false when the API cannot say.
export const hasMyConversation = async () => {
  const outcome = await runApi("user", (api) => api.GET("/v1/chat/unread"));

  return outcome.ok && "hasHistory" in outcome.data && outcome.data.hasHistory;
};
