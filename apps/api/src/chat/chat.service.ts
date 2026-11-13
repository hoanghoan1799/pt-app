import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  CHAT_USER_READER_KEY,
  chatAdminReaderKey,
  type ChatMessageView,
  chatParseCommand,
  type ChatSendMessageRequest,
  stickerToStored,
} from "@pt/contracts";
import { DataSource, EntityManager } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { Clock } from "../common/clock.js";
import { returnedRows } from "../common/sql.js";
import {
  CustomStickersService,
  stickerOwnerOf,
} from "../stickers/custom-stickers.service.js";
import { ChatAccess, type ChatContext } from "./chat.access.js";
import { chatErrors } from "./chat.errors.js";
import {
  CHAT_EVENTS,
  ChatEvents,
  type ChatMessageDeletedEvent,
  type ChatMessageEditedEvent,
  type ChatMessageSentEvent,
  type ChatReactionChangedEvent,
  type ChatReadEvent,
  type ChatStatusChangedEvent,
} from "./chat.events.js";
import { chatCustomStickerUrl } from "./chat.mapper.js";
import { ChatQueries } from "./chat.queries.js";
import { ChatPhotosService, photoUploaderKey } from "./chat-photos.service.js";
import { ChatViews } from "./chat-views.service.js";
import {
  CHAT_POST_QUOTES,
  type ChatPostQuoteReader,
} from "./post-quote.port.js";

export const reactorKeyOf = (actor: AuthActor) =>
  actor.kind === "user" ? CHAT_USER_READER_KEY : chatAdminReaderKey(actor.id);

const actorNameOf = (actor: AuthActor) =>
  actor.kind === "user" ? actor.name : actor.username;

export type SendResult = { message: ChatMessageView; created: boolean };

// The chat use cases: rules plus one transaction each, then the domain event.
// Message bodies are never logged.
@Injectable()
export class ChatService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: ChatQueries,
    private readonly access: ChatAccess,
    private readonly views: ChatViews,
    private readonly photos: ChatPhotosService,
    private readonly stickers: CustomStickersService,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
    @Inject(CHAT_POST_QUOTES) private readonly postQuotes: ChatPostQuoteReader,
  ) {}

  // Send. The conversation comes from the session (trainee) or the trainee in
  // the URL (PT), never from the body. A retried key returns the stored
  // message and publishes nothing. No send limit (D13).
  async send(
    context: ChatContext,
    input: ChatSendMessageRequest,
    clientId: string,
  ): Promise<SendResult> {
    const { actor, trainee } = context;

    this.access.requireWrite(context);
    if (
      input.sticker &&
      "customId" in input.sticker &&
      !(await this.stickers.owns(stickerOwnerOf(actor), input.sticker.customId))
    ) {
      throw chatErrors.invalidInput();
    }
    const resolved = this.resolveContent(input);
    const conversation =
      context.conversation ??
      (await this.queries.getOrCreateConversation(trainee.traineeId));

    const retried = await this.findRetry(actor, conversation.id, clientId);

    if (retried) {
      return { message: retried, created: false };
    }
    const uploaderKey = photoUploaderKey(actor);

    if (
      input.photoId !== undefined &&
      !(await this.photos.isAttachable(
        input.photoId,
        conversation.id,
        uploaderKey,
      ))
    ) {
      throw chatErrors.invalidInput();
    }
    if (input.postId !== undefined) {
      if (resolved.content.body === "") {
        throw chatErrors.postNeedsText();
      }
      if (
        !(await this.postQuotes.canQuote(
          actor,
          input.postId,
          trainee.traineeId,
        ))
      ) {
        throw chatErrors.postNotFound();
      }
    }
    if (input.replyToMessageId !== undefined) {
      const target = await this.queries.findStoredMessage(
        input.replyToMessageId,
      );

      // Unknown and foreign ids are both just invalid.
      if (!target || target.conversationId !== conversation.id) {
        throw chatErrors.invalidInput();
      }
    }
    const now = this.clock.now();
    const sentFromAdmin = actor.kind === "admin";
    // One unit of work: the message, the conversation's last-message pointer
    // (what the unread counts and the inbox read) and the photo attachment.
    const messageId = await this.dataSource.transaction(async (manager) => {
      const inserted: { id: number }[] = await manager.query(
        `INSERT INTO chat_messages
           (conversation_id, sender_role, sender_admin_id, body, sticker_ref, sticker_url,
            photo_id, client_id, reply_to_message_id, reply_post_id, silent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11)
         ON CONFLICT (conversation_id, sender_role, (COALESCE(sender_admin_id, 0)), client_id) DO NOTHING
         RETURNING id`,
        [
          conversation.id,
          sentFromAdmin ? "admin" : "user",
          sentFromAdmin ? actor.id : null,
          resolved.content.body,
          resolved.content.stickerRef,
          resolved.content.stickerUrl,
          clientId,
          input.replyToMessageId ?? null,
          input.postId ?? null,
          resolved.silent ? true : null,
          now,
        ],
      );

      if (inserted.length === 0) {
        return null;
      }
      const id = inserted[0].id;

      if (input.photoId !== undefined) {
        const attached = returnedRows<{ id: number }>(
          await manager.query(
            `UPDATE chat_photos SET message_id = $1
             WHERE id = $2 AND message_id IS NULL RETURNING id`,
            [id, input.photoId],
          ),
        );

        // Lost the photo to a parallel send: nothing is stored.
        if (attached.length === 0) {
          throw chatErrors.invalidInput();
        }
        await manager.query(
          `UPDATE chat_messages SET photo_id = $1 WHERE id = $2`,
          [input.photoId, id],
        );
      }
      // Two parallel sends must not move the pointer back to the older one.
      await manager.query(
        `UPDATE chat_conversations SET last_message_id = $1, last_message_at = $2
         WHERE id = $3 AND COALESCE(last_message_id, 0) < $1`,
        [id, now, conversation.id],
      );
      return id;
    });

    if (messageId === null) {
      // Lost a race with the same key: the other insert wins.
      const winner = await this.findRetry(actor, conversation.id, clientId);

      if (!winner) {
        throw chatErrors.messageNotFound();
      }
      return { message: winner, created: false };
    }
    const message = await this.views.one(messageId, actor);

    if (!message) {
      throw chatErrors.messageNotFound();
    }
    this.events.publish(CHAT_EVENTS.messageSent, {
      conversationId: conversation.id,
      traineeUserId: trainee.traineeId,
      messageId,
      clientId,
      senderRole: sentFromAdmin ? "admin" : "user",
      senderAdminId: sentFromAdmin ? actor.id : null,
      silent: resolved.silent,
      body: resolved.content.body,
      hasSticker: input.sticker !== undefined,
      hasPhoto: input.photoId !== undefined,
      replyToMessageId: input.replyToMessageId ?? null,
    } satisfies ChatMessageSentEvent);
    return { message, created: true };
  }

  // Text or a sticker; the schema has already ruled out both/neither. Slash
  // commands (KAN-167) only apply to text and photo captions: the stored body
  // is the text without the command; a text-only message left empty is
  // rejected. Stickers carry no text, so they are never silent.
  private resolveContent(input: ChatSendMessageRequest) {
    if (input.sticker) {
      return {
        content: {
          body: "",
          ...stickerToStored(input.sticker, chatCustomStickerUrl),
        },
        silent: false,
      };
    }
    const { body, effects } = chatParseCommand(input.body ?? "");

    if (!body && input.photoId === undefined) {
      throw chatErrors.invalidInput();
    }
    return {
      content: { body, stickerRef: null, stickerUrl: null },
      silent: effects.silent === true,
    };
  }

  // The stored message of this sender under this key, if any. The key is
  // scoped by sender: another person reusing it is a different message.
  private async findRetry(
    actor: AuthActor,
    conversationId: number,
    clientId: string,
  ) {
    const stored = await this.queries.findStoredByClientId(
      conversationId,
      actor.kind === "admin" ? "admin" : "user",
      actor.kind === "admin" ? actor.id : null,
      clientId,
    );

    return stored ? this.views.one(stored.id, actor) : null;
  }

  // Own messages only, no time limit. The previous body is kept so both people
  // in the conversation can open the history. Saving the same text again is
  // not an edit: no history row, no marker, no event.
  async edit(actor: AuthActor, messageId: number, body: string) {
    const { stored, conversation, trainee } = await this.access.forMessage(
      actor,
      messageId,
    );

    this.access.requireWrite({ actor, trainee, conversation });
    this.requireOwn(actor, stored);
    if (stored.deletedAt !== null) {
      throw chatErrors.messageUnsent();
    }
    if (stored.stickerRef !== null) {
      throw chatErrors.stickerNotEditable();
    }
    if (stored.body === body) {
      return this.current(actor, messageId);
    }
    const now = this.clock.now();
    const changedAt = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO chat_message_edits (message_id, previous_body, edited_at)
         VALUES ($1, $2, $3)`,
        [messageId, stored.body, now],
      );
      await manager.query(
        `UPDATE chat_messages SET body = $1, edited_at = $2 WHERE id = $3`,
        [body, now, messageId],
      );
      return this.touch(manager, conversation.id, messageId, now);
    });

    this.events.publish(CHAT_EVENTS.messageEdited, {
      conversationId: conversation.id,
      traineeUserId: trainee.traineeId,
      messageId,
      changedAt: changedAt.getTime(),
    } satisfies ChatMessageEditedEvent);
    return this.current(actor, messageId);
  }

  // Unsend for everyone: soft delete, idempotent. An unsent photo is gone for
  // good, bytes included (KAN-160).
  async unsend(actor: AuthActor, messageId: number) {
    const { stored, conversation, trainee } = await this.access.forMessage(
      actor,
      messageId,
    );

    this.access.requireWrite({ actor, trainee, conversation });
    this.requireOwn(actor, stored);
    if (stored.deletedAt !== null) {
      return this.current(actor, messageId);
    }
    const now = this.clock.now();
    const changedAt = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE chat_messages SET deleted_at = $1, reply_post_id = NULL WHERE id = $2`,
        [now, messageId],
      );
      await manager.query(`DELETE FROM chat_photos WHERE message_id = $1`, [
        messageId,
      ]);
      return this.touch(manager, conversation.id, messageId, now);
    });

    this.events.publish(CHAT_EVENTS.messageDeleted, {
      conversationId: conversation.id,
      traineeUserId: trainee.traineeId,
      messageId,
      changedAt: changedAt.getTime(),
    } satisfies ChatMessageDeletedEvent);
    return this.current(actor, messageId);
  }

  // One reaction per reactor per message: another emoji replaces it, the same
  // emoji or null removes it. `emoji === null` clears.
  async react(actor: AuthActor, messageId: number, emoji: string | null) {
    const { stored, conversation, trainee } = await this.access.forMessage(
      actor,
      messageId,
    );

    this.access.requireWrite({ actor, trainee, conversation });
    if (stored.deletedAt !== null) {
      throw chatErrors.messageUnsent();
    }
    const reactorKey = reactorKeyOf(actor);
    const existing: { emoji: string }[] = await this.dataSource.query(
      `SELECT emoji FROM chat_reactions WHERE message_id = $1 AND reactor_key = $2`,
      [messageId, reactorKey],
    );
    const previous = existing[0]?.emoji ?? null;
    const removing = emoji === null || previous === emoji;

    if (removing && previous === null) {
      return this.current(actor, messageId);
    }
    const now = this.clock.now();
    const changedAt = await this.dataSource.transaction(async (manager) => {
      if (removing) {
        await manager.query(
          `DELETE FROM chat_reactions WHERE message_id = $1 AND reactor_key = $2`,
          [messageId, reactorKey],
        );
      } else {
        await manager.query(
          `INSERT INTO chat_reactions (message_id, reactor_key, emoji, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (message_id, reactor_key)
           DO UPDATE SET emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at`,
          [messageId, reactorKey, emoji, now],
        );
      }
      return this.touch(manager, conversation.id, messageId, now);
    });

    this.events.publish(CHAT_EVENTS.reactionChanged, {
      conversationId: conversation.id,
      traineeUserId: trainee.traineeId,
      messageId,
      changedAt: changedAt.getTime(),
      reactorKey,
      reactorName: actorNameOf(actor),
      emoji: removing ? null : emoji,
      previousEmoji: previous,
      authorRole: stored.senderRole,
      authorAdminId: stored.senderAdminId,
    } satisfies ChatReactionChangedEvent);
    return this.current(actor, messageId);
  }

  // Reading stays allowed while chat is locked (D5). The cursor only moves
  // forward and is clamped to the last message.
  async markRead(context: ChatContext, requested: number) {
    const { conversation, trainee, actor } = context;

    if (!conversation) {
      return 0;
    }
    const readerKey = reactorKeyOf(actor);
    const saved = await this.queries.saveReadCursor(
      conversation.id,
      readerKey,
      requested,
      conversation.lastMessageId ?? 0,
      this.clock.now(),
    );

    this.events.publish(CHAT_EVENTS.read, {
      conversationId: conversation.id,
      traineeUserId: trainee.traineeId,
      readerKey,
      lastReadMessageId: saved,
    } satisfies ChatReadEvent);
    return saved;
  }

  // Admin switch: lock or unlock chat for one trainee (S1) and record who did
  // it and when.
  async setEnabled(context: ChatContext, enabled: boolean) {
    const { actor, trainee } = context;

    if (actor.kind !== "admin") {
      throw chatErrors.userNotFound();
    }
    // The conversation exists from the moment chat is on, not from the first
    // message: the PT's inbox and the trainee's thread have a row to open.
    // Same transaction as the switch, insert-or-ignore, so repeating it or
    // racing a thread read (which also creates it) is harmless.
    const conversation = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE users SET chat_enabled = $1, chat_enabled_changed_at = $2,
                          chat_enabled_by_admin_id = $3
         WHERE id = $4`,
        [enabled, this.clock.now(), actor.id, trainee.traineeId],
      );
      return enabled
        ? this.queries.getOrCreateConversation(trainee.traineeId, manager)
        : context.conversation;
    });

    this.events.publish(CHAT_EVENTS.statusChanged, {
      userId: trainee.traineeId,
      conversationId: conversation?.id ?? null,
      enabled,
    } satisfies ChatStatusChangedEvent);
    return enabled;
  }

  // Stamps the change cursor and the message with it. The cursor is strictly
  // increasing, so a change in the same millisecond as a poll is never lost to
  // `updated_at > changedSince`.
  private async touch(
    manager: EntityManager,
    conversationId: number,
    messageId: number,
    now: Date,
  ) {
    const changedAt = await this.queries.bumpConversationChange(
      manager,
      conversationId,
      now,
    );

    await manager.query(
      `UPDATE chat_messages SET updated_at = $1 WHERE id = $2`,
      [changedAt, messageId],
    );
    return changedAt;
  }

  private requireOwn(
    actor: AuthActor,
    stored: { senderRole: "user" | "admin"; senderAdminId: number | null },
  ) {
    const own =
      actor.kind === "user"
        ? stored.senderRole === "user"
        : stored.senderRole === "admin" && stored.senderAdminId === actor.id;

    if (!own) {
      throw chatErrors.notYourMessage();
    }
  }

  private async current(actor: AuthActor, messageId: number) {
    const message = await this.views.one(messageId, actor);

    if (!message) {
      throw chatErrors.messageNotFound();
    }
    return message;
  }
}
