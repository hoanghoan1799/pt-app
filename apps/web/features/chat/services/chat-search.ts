import "server-only";

import { askApi, type Asked } from "@/features/chat/services/chat-api";

// Text search inside one conversation, newest match first (KAN-160, S1). The
// API does the accent-insensitive matching and owns access.

export const askMySearch = (
  q: string,
  before: number | undefined,
): Promise<Asked<unknown>> =>
  askApi("user", (api) =>
    api.GET("/v1/chat/conversations/me/search", {
      params: { query: { q, before } },
    }),
  );

export const askConversationSearch = (
  conversationId: number,
  q: string,
  before: number | undefined,
): Promise<Asked<unknown>> =>
  askApi("admin", (api) =>
    api.GET("/v1/chat/conversations/{cid}/search", {
      params: { path: { cid: conversationId }, query: { q, before } },
    }),
  );
