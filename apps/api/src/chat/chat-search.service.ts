import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  CHAT_SEARCH_PAGE_SIZE,
  chatBuildSnippet,
  chatFindMatch,
  chatIsSearchableQuery,
  chatSearchWords,
  type ChatSnippet,
} from "@pt/contracts";
import { DataSource } from "typeorm";

export type SearchResultRow = {
  messageId: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  senderName: string | null;
  snippet: ChatSnippet;
  createdAt: string;
};

export type SearchPage = {
  results: SearchResultRow[];
  nextCursor: number | null;
};

const BATCH = 300;

// `\`, `%` and `_` are LIKE wildcards: a user typing "50%" means the text.
const escapeLike = (word: string) =>
  word.replace(/[\\%_]/g, (char) => `\\${char}`);

// Text search inside one conversation, newest match first (KAN-160, S1).
// Accent-insensitive: PostgreSQL narrows with immutable_unaccent(lower(body))
// (the trigram index of the baseline migration; it maps đ to d like the JS
// fold), and chatFindMatch, the same function the web uses, makes the final
// decision and builds the snippet. Unsent messages and stickers never match (a
// photo's caption is text and does). The cursor is the message id the scan
// continues below.
@Injectable()
export class ChatSearchService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(
    conversationId: number,
    query: string,
    before: number | undefined,
    limit = CHAT_SEARCH_PAGE_SIZE,
  ): Promise<SearchPage> {
    if (!chatIsSearchableQuery(query)) {
      throw new HttpException(
        { code: "INVALID_QUERY", message: "Từ khoá tìm kiếm không hợp lệ" },
        HttpStatus.BAD_REQUEST,
      );
    }
    // Words joined by % so a line break or double space in the body still
    // matches the single space of the query; the JS check is exact.
    const pattern = `%${chatSearchWords(query).map(escapeLike).join("%")}%`;
    const results: SearchResultRow[] = [];
    let cursor = before;

    for (;;) {
      const rows: {
        id: number;
        body: string;
        senderRole: "user" | "admin";
        senderAdminId: number | null;
        senderAdminName: string | null;
        createdAt: Date;
      }[] = await this.dataSource.query(
        `SELECT m.id, m.body, m.sender_role AS "senderRole",
                m.sender_admin_id AS "senderAdminId", a.username AS "senderAdminName",
                m.created_at AS "createdAt"
         FROM chat_messages m LEFT JOIN admins a ON a.id = m.sender_admin_id
         WHERE m.conversation_id = $1
           AND m.deleted_at IS NULL AND m.sticker_ref IS NULL AND m.body <> ''
           AND immutable_unaccent(lower(m.body)) LIKE $2
           ${cursor === undefined ? "" : "AND m.id < $4"}
         ORDER BY m.id DESC
         LIMIT $3`,
        cursor === undefined
          ? [conversationId, pattern, BATCH]
          : [conversationId, pattern, BATCH, cursor],
      );

      for (const row of rows) {
        const range = chatFindMatch(row.body, query);

        if (!range) {
          continue;
        }
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
          snippet: chatBuildSnippet(row.body, range),
          createdAt: row.createdAt.toISOString(),
        });
      }
      if (rows.length < BATCH) {
        return { results, nextCursor: null };
      }
      cursor = rows[rows.length - 1].id;
    }
  }
}
