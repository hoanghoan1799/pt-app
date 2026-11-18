import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import {
  CHAT_EVENTS,
  ChatEvents,
  type ChatMessageDeletedEvent,
} from "./chat.events.js";
import { bumpConversationChange } from "./conversation-change.js";

// Admin moderation of the chat: hides one message for everybody. Readers treat
// a hidden message exactly like an unsent one (no body, sticker, photo,
// reactions or quote); the row and a photo's bytes stay, so the report keeps its
// evidence. The only code that sets chat_messages.hidden_by_admin_id.
@Injectable()
export class ChatModeration {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // Idempotent: hiding twice keeps the first admin. `hidden: false` means the
  // message does not exist or was unsent already (nothing left to hide).
  async hide(adminId: number, messageId: number): Promise<{ hidden: boolean }> {
    const now = this.clock.now();
    const done = await this.dataSource.transaction(async (manager) => {
      const rows: { conversationId: number; traineeUserId: number }[] =
        await manager.query(
          `WITH hidden AS (
             UPDATE chat_messages SET hidden_by_admin_id = $1, reply_post_id = NULL
             WHERE id = $2 AND deleted_at IS NULL AND hidden_by_admin_id IS NULL
             RETURNING conversation_id)
           SELECT h.conversation_id AS "conversationId", c.user_id AS "traineeUserId"
           FROM hidden h JOIN chat_conversations c ON c.id = h.conversation_id`,
          [adminId, messageId],
        );
      const changed = rows[0];

      if (!changed) {
        return null;
      }
      const changedAt = await bumpConversationChange(
        manager,
        changed.conversationId,
        now,
      );

      await manager.query(
        `UPDATE chat_messages SET updated_at = $1 WHERE id = $2`,
        [changedAt, messageId],
      );
      return { ...changed, changedAt };
    });

    if (done) {
      this.events.publish(CHAT_EVENTS.messageDeleted, {
        conversationId: done.conversationId,
        traineeUserId: done.traineeUserId,
        messageId,
        changedAt: done.changedAt.getTime(),
      } satisfies ChatMessageDeletedEvent);
      return { hidden: true };
    }
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM chat_messages
       WHERE id = $1 AND deleted_at IS NULL AND hidden_by_admin_id IS NOT NULL`,
      [messageId],
    );

    return { hidden: rows.length > 0 };
  }
}
