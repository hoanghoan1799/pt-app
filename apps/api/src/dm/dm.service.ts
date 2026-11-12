import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DM_MESSAGES } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor, UserActor } from "../auth/actor.js";
import type {
  DmMessageDeletedEvent,
  DmReadEvent,
} from "../chat/chat.events.js";
import { CHAT_EVENTS, ChatEvents } from "../chat/chat.events.js";
import { Clock } from "../common/clock.js";
import { notFoundError } from "../common/errors.js";
import { returnedRows } from "../common/sql.js";
import {
  FILE_STORAGE,
  type FileStorage,
  type StoredFile,
} from "../files/file-storage.js";
import { DmQueries } from "./dm.queries.js";
import { dmPairOf } from "./dm.rules.js";

const notFound = () => notFoundError("DM_NOT_FOUND", DM_MESSAGES.NOT_FOUND);

// Owner decision 2026-11-09: trainees no longer chat with each other. Old
// conversations stay readable (and a member can unsend), but nobody can send.
const disabled = () =>
  new HttpException(
    { code: "DM_DISABLED", message: DM_MESSAGES.DISABLED },
    HttpStatus.FORBIDDEN,
  );

@Injectable()
export class DmService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly queries: DmQueries,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // The social features sit behind the terms.
  async requireTerms(actor: UserActor) {
    const rows: { termsVersion: number | null }[] = await this.dataSource.query(
      `SELECT terms_version AS "termsVersion" FROM users WHERE id = $1`,
      [actor.id],
    );

    if ((rows[0]?.termsVersion ?? 0) < 1) {
      throw new HttpException(
        { code: "TERMS_REQUIRED", message: DM_MESSAGES.TERMS_REQUIRED },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  // Opens an existing (read-only) conversation; new ones are never created.
  async open(actor: UserActor, otherId: number) {
    await this.requireTerms(actor);
    if (otherId === actor.id) {
      throw notFound();
    }
    const blocked: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM social_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [actor.id, otherId],
    );

    if (blocked.length > 0) {
      throw notFound();
    }
    const { low, high } = dmPairOf(actor.id, otherId);
    const existing = await this.queries.existingBetween(low, high);

    if (existing === null) {
      throw disabled();
    }
    return existing;
  }

  async thread(
    actor: AuthActor,
    conversationId: number,
    cursor: { after?: number; before?: number },
  ) {
    const view = await this.queries.resolveView(actor, conversationId);

    if (!view) {
      throw notFound();
    }
    return {
      ...(await this.queries.listThread(conversationId, {
        ...cursor,
        otherId: view.otherId,
        viewer: actor,
      })),
      readOnlyReason: view.readOnlyReason,
      isReadOnly: view.access !== "member" || view.readOnlyReason !== null,
    };
  }

  // Sending is switched off for everyone. A non-member still gets "not found".
  async send(actor: UserActor, conversationId: number): Promise<never> {
    const view = await this.queries.resolveView(actor, conversationId);

    if (!view || view.access !== "member") {
      throw notFound();
    }
    throw disabled();
  }

  // Only the sender, only a live message, still possible in a read-only chat
  // (a member may always take back their own words). The photo bytes go too.
  async unsend(actor: UserActor, messageId: number) {
    const rows: { conversationId: number }[] = await this.dataSource.query(
      `SELECT conversation_id AS "conversationId" FROM dm_messages WHERE id = $1`,
      [messageId],
    );
    const conversationId = rows[0]?.conversationId;
    const view =
      conversationId === undefined
        ? null
        : await this.queries.resolveView(actor, conversationId);

    if (!view || view.access !== "member" || conversationId === undefined) {
      throw notFound();
    }
    const done = await this.dataSource.transaction(async (manager) => {
      const updated = returnedRows<{ id: number }>(
        await manager.query(
          `UPDATE dm_messages
           SET deleted_at = $1, body = NULL, photo_id = NULL, reply_post_id = NULL
           WHERE id = $2 AND conversation_id = $3 AND sender_id = $4 AND deleted_at IS NULL
           RETURNING id`,
          [this.clock.now(), messageId, conversationId, actor.id],
        ),
      );

      if (updated.length === 0) {
        return false;
      }
      await manager.query(`DELETE FROM dm_photos WHERE message_id = $1`, [
        messageId,
      ]);
      return true;
    });

    if (!done) {
      throw notFound();
    }
    this.events.publish(CHAT_EVENTS.dmMessageDeleted, {
      conversationId,
      messageId,
      senderId: actor.id,
    } satisfies DmMessageDeletedEvent);
  }

  // Marks everything in the conversation as read; for a member only. Read
  // marks only move forward.
  async markRead(actor: UserActor, conversationId: number) {
    const view = await this.queries.resolveView(actor, conversationId);

    if (!view || view.access !== "member") {
      throw notFound();
    }
    const last = view.conversation.lastMessageId;

    if (!last) {
      return 0;
    }
    const rows: { value: number }[] = await this.dataSource.query(
      `INSERT INTO dm_reads (conversation_id, user_id, last_read_message_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, user_id) DO UPDATE
         SET last_read_message_id = GREATEST(dm_reads.last_read_message_id, EXCLUDED.last_read_message_id)
       RETURNING last_read_message_id AS value`,
      [conversationId, actor.id, last],
    );

    this.events.publish(CHAT_EVENTS.dmRead, {
      conversationId,
      userId: actor.id,
      lastReadMessageId: rows[0].value,
    } satisfies DmReadEvent);
    return rows[0].value;
  }

  // The bytes, only for a photo of a live message in a conversation the viewer
  // may open (members, or a super admin read-only). A pending upload is
  // visible to no one; a PT never gets it.
  async photo(actor: AuthActor, photoId: number): Promise<StoredFile> {
    const rows: { conversationId: number }[] = await this.dataSource.query(
      `SELECT p.conversation_id AS "conversationId"
       FROM dm_photos p JOIN dm_messages m ON m.id = p.message_id
       WHERE p.id = $1 AND m.deleted_at IS NULL`,
      [photoId],
    );
    const view = rows[0]
      ? await this.queries.resolveView(actor, rows[0].conversationId)
      : null;
    const file = view
      ? await this.storage.get({ collection: "dm-photo", id: photoId })
      : null;

    if (!file) {
      throw notFound();
    }
    return file;
  }
}
