import "server-only";

import { webizeUrls } from "@/features/chat/utils/api-urls";
import type { DmThreadPage } from "@/features/social/types/dm";
import { callApi, tryApi } from "@/services/api/call";

// Read-only views for the super admin (Q6), through the API: GET
// /v1/admin/dm/conversations and the thread route, which a PT never gets.
// Callers must have passed requireSuperAdmin; the API checks the role too.

export interface AdminDmRow {
  id: number;
  lowName: string;
  highName: string;
  lastMessageAt: Date | null;
  preview: string;
}

// Names and previews come in the admin's saved language (the API words them).
export const listAllDmConversations = async (): Promise<AdminDmRow[]> => {
  const { conversations } = await callApi("admin", (api) =>
    api.GET("/v1/admin/dm/conversations"),
  );

  return conversations.map((row) => ({
    ...row,
    lastMessageAt:
      row.lastMessageAt === null ? null : new Date(row.lastMessageAt),
  }));
};

export interface AdminDmThread {
  thread: DmThreadPage;
  // The two members' real names by user id, low id first; a deleted account is
  // left out of the map but keeps its id in `memberIds`.
  names: Map<number, string>;
  memberIds: number[];
}

// Null for a conversation that does not exist (the API answers 404).
export const loadAdminDmThread = async (
  conversationId: number,
  before?: number,
): Promise<AdminDmThread | null> => {
  const outcome = await tryApi("admin", (api) =>
    api.GET("/v1/dm/conversations/{cid}/messages", {
      params: {
        path: { cid: conversationId },
        query: before === undefined ? {} : { before },
      },
    }),
  );

  if (!outcome.ok) {
    if (outcome.error.status === 404) {
      return null;
    }
    throw outcome.error;
  }
  const data = webizeUrls(outcome.data);

  return {
    thread: data,
    names: new Map(
      data.members.flatMap((member) =>
        member.name === null ? [] : [[member.id, member.name] as const],
      ),
    ),
    memberIds: data.members.map((member) => member.id),
  };
};
