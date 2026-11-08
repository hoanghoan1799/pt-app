import "server-only";

import { and, desc, eq, isNull, lt, ne } from "drizzle-orm";

import { db } from "@/db";
import { admins, chatMessages } from "@/db/schema";
import { findConversationById } from "@/features/chat/services/chat-queries";
import {
  buildSnippet,
  findMatch,
  SEARCH_PAGE_SIZE,
  type SearchPage,
} from "@/features/chat/utils/search-rules";
import { canAdminAccessUser } from "@/services/hidden-users";

// Rows read per round trip while scanning, and the most rows one request may
// scan. Conversations are small; the cap only bounds the worst case, and the
// cursor lets the client continue from where the scan stopped.
const SCAN_BATCH = 300;
const SCAN_LIMIT = 6000;

// Text search inside one conversation, newest match first (KAN-160, S1).
// Accent-insensitive Vietnamese cannot be done with SQL LIKE on the stored
// text, and no normalised column may be added to the existing table, so the
// text messages are read in pages and matched in JS. Unsent messages and
// stickers never match (a photo's caption is text and does). The cursor is the
// message id the scan continues below.
export const searchConversation = async (
  conversationId: number,
  query: string,
  {
    before,
    limit = SEARCH_PAGE_SIZE,
  }: { before?: number; limit?: number } = {},
): Promise<SearchPage> => {
  const results: SearchPage["results"] = [];
  let cursor = before;
  let scanned = 0;

  while (scanned < SCAN_LIMIT) {
    const rows = await db
      .select({
        id: chatMessages.id,
        body: chatMessages.body,
        senderRole: chatMessages.senderRole,
        senderAdminId: chatMessages.senderAdminId,
        senderAdminName: admins.username,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.stickerRef),
          ne(chatMessages.body, ""),
          cursor === undefined ? undefined : lt(chatMessages.id, cursor),
        ),
      )
      .orderBy(desc(chatMessages.id))
      .limit(SCAN_BATCH);

    for (const row of rows) {
      const range = findMatch(row.body, query);

      if (range) {
        if (results.length === limit) {
          // One more match exists: continue below the last one returned.
          return {
            results,
            nextCursor: results[results.length - 1].messageId,
          };
        }
        results.push({
          messageId: row.id,
          senderRole: row.senderRole,
          senderAdminId: row.senderAdminId,
          senderName: row.senderRole === "admin" ? row.senderAdminName : null,
          snippet: buildSnippet(row.body, range),
          createdAt: row.createdAt.toISOString(),
        });
      }
    }
    if (rows.length < SCAN_BATCH) {
      return { results, nextCursor: null };
    }
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;
  }
  // Scan cap reached with the page not full: let the client ask again.
  return { results, nextCursor: cursor ?? null };
};

export type SearchResultStatus =
  { status: "ok"; page: SearchPage } | { status: "not_found" };

// Trainee: only their own conversation (never takes a conversation id).
export const searchForTrainee = async (
  conversationId: number | null,
  query: string,
  before?: number,
): Promise<SearchResultStatus> => ({
  status: "ok",
  page:
    conversationId === null
      ? { results: [], nextCursor: null }
      : await searchConversation(conversationId, query, { before }),
});

// Admin: any conversation of a trainee this admin may access. A hidden
// trainee is "not found" unless revealed.
export const searchForAdmin = async (
  adminId: number,
  conversationId: number,
  query: string,
  before?: number,
): Promise<SearchResultStatus> => {
  const conversation = await findConversationById(conversationId);

  if (
    !conversation ||
    !(await canAdminAccessUser(adminId, conversation.userId))
  ) {
    return { status: "not_found" };
  }
  return {
    status: "ok",
    page: await searchConversation(conversation.id, query, { before }),
  };
};
