import "server-only";

import { webizeUrls } from "@/features/chat/utils/api-urls";
import type { DmThreadPage } from "@/features/social/types/dm";
import { runApi } from "@/services/api/call";

// Trainee-to-trainee chats are read-only (since 2026-11-09). The API owns
// membership, terms and the "disabled" rule; the pages read through it.

export interface DmInboxItem {
  conversationId: number;
  otherId: number;
  name: string;
  avatarUrl: string | null;
  preview: string;
  lastMessageAt: string | null;
  unread: number;
}

// Empty for a trainee who has not accepted the terms (the API refuses) and when
// the API cannot be reached: the Messages tab still shows the coach chat.
export const listDmInbox = async (): Promise<DmInboxItem[]> => {
  const outcome = await runApi("user", (api) =>
    api.GET("/v1/dm/conversations"),
  );

  return outcome.ok ? webizeUrls(outcome.data.conversations) : [];
};

export type DmThreadView = DmThreadPage & {
  readOnlyReason: string | null;
  isReadOnly: boolean;
};

// Null for a conversation the viewer is not part of (the API answers 404).
export const loadDmThread = async (
  conversationId: number,
): Promise<DmThreadView | null> => {
  const outcome = await runApi("user", (api) =>
    api.GET("/v1/dm/conversations/{cid}/messages", {
      params: { path: { cid: conversationId }, query: {} },
    }),
  );

  if (outcome.ok) {
    return webizeUrls(outcome.data) as DmThreadView;
  }
  if (outcome.error.status === 404) {
    return null;
  }
  throw outcome.error;
};
