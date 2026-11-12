import "server-only";

import { HIDDEN_CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  findConversationHeader,
  type InboxItem,
  type InboxWithoutConversation,
  listHiddenInboxForAdmin,
} from "@/features/chat/services/chat-queries";
import { webizeUrls } from "@/features/chat/utils/api-urls";
import { callApi, runApi, tryApi } from "@/services/api/call";

// Trainees an admin hid for themselves (KAN-163). The API owns the passcode,
// the reveal window and every access rule; these wrap its routes in the shapes
// the inbox and the chat sheet use.

export interface HiddenUser {
  userId: number;
  userName: string;
  // The nickname an admin set, else the real name (same as the inbox).
  displayName: string;
  avatarUrl: string | null;
}

export type HideResult =
  { status: "success"; hidden: number } | { status: "error"; message: string };

export type RevealResult =
  | {
      status: "success";
      // Every trainee this admin hid, by name.
      users: HiddenUser[];
      // The same trainees in inbox shape: with a conversation, and without.
      conversations: InboxItem[];
      withoutConversation: InboxWithoutConversation[];
    }
  | { status: "error"; message: string };

// Generic on purpose: no detail on why (wrong code, no passcode, limited).
export const noMatch = (): { status: "error"; message: string } => ({
  status: "error",
  message: HIDDEN_CHAT_MESSAGES.NO_MATCH,
});

// A conversation maps to its trainee; null when this admin cannot read it.
const userIdOfConversation = async (conversationId: number) =>
  (await findConversationHeader(conversationId))?.userId ?? null;

export const isConversationHidden = async (conversationId: number) => {
  const userId = await userIdOfConversation(conversationId);

  if (userId === null) {
    return false;
  }
  const status = await callApi("admin", (api) =>
    api.GET("/v1/admins/me/hidden-users/{userId}", {
      params: { path: { userId } },
    }),
  );

  return status.hidden;
};

// Hides trainees for this admin only, with or without a conversation. Needs a
// passcode (Q3); unknown ids are ignored and a repeat is a no-op.
export const hideUsers = async (userIds: number[]): Promise<HideResult> => {
  const outcome = await tryApi("admin", (api) =>
    api.POST("/v1/admins/me/hidden-users", {
      body: { userIds: [...new Set(userIds)] },
    }),
  );

  return outcome.ok
    ? { status: "success", hidden: outcome.data.hidden }
    : { status: "error", message: outcome.error.message };
};

export const unhideUser = async (userId: number) => {
  await callApi("admin", (api) =>
    api.DELETE("/v1/admins/me/hidden-users/{userId}", {
      params: { path: { userId } },
    }),
  );
};

// Conversation-based wrappers for the inbox and the chat sheet.
export const hideConversations = async (
  conversationIds: number[],
): Promise<HideResult> => {
  const owners = await Promise.all(
    [...new Set(conversationIds)].map(userIdOfConversation),
  );

  return hideUsers(owners.filter((id): id is number => id !== null));
};

export const unhideConversation = async (conversationId: number) => {
  const userId = await userIdOfConversation(conversationId);

  if (userId !== null) {
    await unhideUser(userId);
  }
};

// The reveal payload once the API accepted the passcode (it also opened the
// reveal window on the session): the hidden trainees by name and in inbox
// shape.
export const listRevealedHidden = async (): Promise<RevealResult> => {
  const [hidden, inbox] = await Promise.all([
    runApi("admin", (api) => api.GET("/v1/admins/me/hidden-users")),
    listHiddenInboxForAdmin(),
  ]);

  if (!hidden.ok) {
    return noMatch();
  }
  return {
    status: "success",
    users: webizeUrls(hidden.data.users),
    conversations: inbox.conversations,
    withoutConversation: inbox.withoutConversation,
  };
};
