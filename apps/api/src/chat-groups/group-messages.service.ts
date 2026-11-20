import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  chatParseCommand,
  type GroupMessageView,
  groupSeenByKeys,
  type GroupSendMessageRequest,
  type GroupThreadQuery,
  stickerToStored,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { ChatEvents } from "../chat/chat.events.js";
import { chatCustomStickerUrl } from "../chat/chat.mapper.js";
import { attachPendingPhotos } from "../common/attach-photos.js";
import { Clock } from "../common/clock.js";
import { returnedRows } from "../common/sql.js";
import {
  CustomStickersService,
  stickerOwnerOf,
} from "../stickers/custom-stickers.service.js";
import { GroupAccess, type GroupContext } from "./group.access.js";
import { groupErrors } from "./group.errors.js";
import {
  GROUP_EVENTS,
  type GroupMessageSentEvent,
  type GroupMessageUpdatedEvent,
  type GroupReadEvent,
} from "./group.events.js";
import { toGroupHeader } from "./group.mapper.js";
import { GroupQueries, type MessageRow } from "./group.queries.js";
import { GroupNames } from "./group-names.service.js";
import { movePointer } from "./group-system-lines.js";
import { GroupViews } from "./group-views.service.js";

export type GroupSendResult = { message: GroupMessageView; created: boolean };

// Reading and writing messages in a group (company group-core.ts send / read
// cursor and group-mutations.ts): the rules, one transaction each, then the
// domain event. The group, the role and the rights always come from
// GroupAccess, never from the client. Message bodies are never logged.
@Injectable()
export class GroupMessagesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: GroupAccess,
    private readonly queries: GroupQueries,
    private readonly views: GroupViews,
    private readonly names: GroupNames,
    private readonly stickers: CustomStickersService,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // --- Reading ------------------------------------------------------------

  async thread(auth: AuthActor, groupId: number, query: GroupThreadQuery) {
    const context = await this.access.load(auth, groupId);
    const { group, actor } = context;
    const lastChangeAt = group.lastChangeAt?.getTime() ?? 0;
    const [page, changed, member] = await Promise.all([
      this.queries.page(group.id, actor, query),
      query.changedSince === undefined
        ? Promise.resolve({ rows: [] as MessageRow[], lastChangeAt })
        : this.queries.changes(
            group.id,
            actor,
            query.changedSince,
            lastChangeAt,
          ),
      this.queries.findMember(group.id, actor.key),
    ]);
    const [messages, changes] = await Promise.all([
      this.views.hydrate(page.rows, group.id, actor),
      this.views.hydrate(changed.rows, group.id, actor),
    ]);

    return {
      messages,
      hasMore: page.hasMore,
      changes,
      lastChangeAt: changed.lastChangeAt,
      group: toGroupHeader(group),
      viewer: this.viewerOf(context, member?.mutedAt ?? null),
    };
  }

  viewerOf(context: GroupContext, mutedAt: Date | null) {
    const { actor } = context;

    return {
      key: actor.key,
      role: actor.role,
      isManager: actor.isManager,
      canManage: actor.canManage && context.group.dissolvedAt === null,
      isSuperAdmin: actor.isSuperAdmin,
      muted: mutedAt !== null,
      sendBlock: this.access.sendBlock(context),
    };
  }

  // Previous bodies, oldest first; an unsent or hidden message shows none.
  async edits(auth: AuthActor, groupId: number, messageId: number) {
    const { actor } = await this.access.load(auth, groupId);
    const stored = await this.queries.message(groupId, messageId, actor);

    if (!stored || stored.kind !== "message") {
      throw groupErrors.messageNotFound();
    }
    if (stored.deletedAt !== null || stored.hiddenAt !== null) {
      return [];
    }
    return (await this.queries.edits(messageId)).map((edit) => ({
      id: edit.id,
      previousBody: edit.previousBody,
      editedAt: edit.editedAt.toISOString(),
    }));
  }

  // Who read up to a message of the group, never its sender. System lines
  // and alerts have no "Seen by".
  async seenBy(auth: AuthActor, groupId: number, messageId: number) {
    const { actor } = await this.access.load(auth, groupId);
    const stored = await this.queries.message(groupId, messageId, actor);

    if (!stored || stored.kind !== "message" || stored.audience !== null) {
      throw groupErrors.messageNotFound();
    }
    const keys = groupSeenByKeys(
      stored,
      await this.queries.readerCursors(groupId),
    );
    const { identities, nameOf } = await this.names.shown(actor.key, keys);

    return keys.flatMap((key) => {
      const identity = identities.get(key);

      return identity
        ? [{ key, role: identity.role, name: nameOf(key) ?? identity.name }]
        : [];
    });
  }

  // --- Sending ------------------------------------------------------------

  // Send: a retry by the same sender (UNIQUE (group_id, sender_key,
  // client_id)) returns the stored message and publishes nothing; then the
  // send-block rule, the content, the photos and the reply target; then one
  // transaction for the message, its photos and the inbox pointer.
  async send(
    auth: AuthActor,
    groupId: number,
    input: GroupSendMessageRequest,
    clientId: string,
  ): Promise<GroupSendResult> {
    const context = await this.access.load(auth, groupId);
    const { group, actor } = context;
    const retried = await this.findRetry(context, clientId);

    if (retried) {
      return { message: retried, created: false };
    }
    this.access.requireWrite(context);
    if (
      input.sticker &&
      "customId" in input.sticker &&
      !(await this.stickers.owns(stickerOwnerOf(auth), input.sticker.customId))
    ) {
      throw groupErrors.invalidInput();
    }
    const photoIds = input.photoIds ?? [];
    const resolved = this.resolveContent(input, photoIds.length > 0);

    if (!(await this.arePhotosAttachable(photoIds, group.id, actor.key))) {
      throw groupErrors.invalidInput();
    }
    if (
      input.replyToMessageId !== undefined &&
      !(await this.loadMessage(context, input.replyToMessageId))
    ) {
      throw groupErrors.invalidInput();
    }
    const now = this.clock.now();
    const messageId = await this.dataSource.transaction(async (manager) => {
      const inserted = returnedRows<{ id: number }>(
        await manager.query(
          `INSERT INTO chat_group_messages
             (group_id, kind, sender_key, body, sticker_ref, sticker_url,
              client_id, reply_to_message_id, silent, created_at)
           VALUES ($1, 'message', $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (group_id, sender_key, client_id) DO NOTHING
           RETURNING id`,
          [
            group.id,
            actor.key,
            resolved.content.body,
            resolved.content.stickerRef,
            resolved.content.stickerUrl,
            clientId,
            input.replyToMessageId ?? null,
            resolved.silent,
            now,
          ],
        ),
      );

      if (inserted.length === 0) {
        return null;
      }
      const id = inserted[0].id;

      // The array order is the display order; the first photo is the cover.
      // A photo lost to a parallel send undoes the whole send.
      if (
        !(await attachPendingPhotos(manager, {
          table: "chat_group_photos",
          ownerColumn: "message_id",
          ownerId: id,
          photoIds,
          guard: "group_id = $2 AND uploader_key = $3",
          guardParams: [group.id, actor.key],
        }))
      ) {
        throw groupErrors.invalidInput();
      }
      if (photoIds.length > 0) {
        await manager.query(
          `UPDATE chat_group_messages SET photo_id = $1 WHERE id = $2`,
          [photoIds[0], id],
        );
      }
      await movePointer(manager, group.id, id, now);
      return id;
    });

    if (messageId === null) {
      // Lost a race with the same key: the other insert wins.
      const winner = await this.findRetry(context, clientId);

      if (!winner) {
        throw groupErrors.messageNotFound();
      }
      return { message: winner, created: false };
    }
    const message = await this.views.one(group.id, messageId, actor);

    if (!message) {
      throw groupErrors.messageNotFound();
    }
    this.events.publish(GROUP_EVENTS.messageSent, {
      groupId: group.id,
      messageId,
      kind: "message",
      audience: null,
      // /imlang: stored and published, but nobody is pushed.
      push: resolved.silent
        ? null
        : {
            senderKey: actor.key,
            body: resolved.content.body,
            sticker: input.sticker !== undefined,
            photoCount: photoIds.length,
          },
    } satisfies GroupMessageSentEvent);
    return { message, created: true };
  }

  private async findRetry(context: GroupContext, clientId: string) {
    const id = await this.queries.byClientId(
      context.group.id,
      context.actor.key,
      clientId,
    );

    return id === null
      ? null
      : this.views.one(context.group.id, id, context.actor);
  }

  // Text or a sticker; slash commands only apply to text and captions; a
  // text-only message left empty by the command is refused.
  private resolveContent(input: GroupSendMessageRequest, hasPhotos: boolean) {
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

    if (!body && !hasPhotos) {
      throw groupErrors.invalidInput();
    }
    return {
      content: { body, stickerRef: null, stickerUrl: null },
      silent: effects.silent === true,
    };
  }

  // Attachable once, by their uploader, to a message of the group they were
  // uploaded for.
  private async arePhotosAttachable(
    photoIds: readonly number[],
    groupId: number,
    uploaderKey: string,
  ) {
    if (photoIds.length === 0) {
      return true;
    }
    if (new Set(photoIds).size !== photoIds.length) {
      return false;
    }
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM chat_group_photos
       WHERE id = ANY($1::int[]) AND group_id = $2 AND uploader_key = $3
         AND message_id IS NULL`,
      [photoIds, groupId, uploaderKey],
    );

    return rows.length === photoIds.length;
  }

  // A real message the actor may read: system lines and alerts are not
  // reactable, editable, unsendable, hideable or quotable.
  private async loadMessage(context: GroupContext, messageId: number) {
    const stored = await this.queries.message(
      context.group.id,
      messageId,
      context.actor,
    );

    return stored && stored.kind === "message" ? stored : null;
  }

  private async requireMessage(context: GroupContext, messageId: number) {
    const stored = await this.loadMessage(context, messageId);

    if (!stored) {
      throw groupErrors.messageNotFound();
    }
    return stored;
  }

  // --- Message changes ------------------------------------------------------

  // One reaction per reactor: another emoji replaces it, the same emoji or
  // null removes it. Still allowed under managers-only.
  async react(
    auth: AuthActor,
    groupId: number,
    messageId: number,
    emoji: string | null,
  ) {
    const context = await this.access.load(auth, groupId);

    this.access.requireWrite(context, { ignoreManagersOnly: true });
    const stored = await this.requireMessage(context, messageId);

    if (stored.deletedAt !== null) {
      throw groupErrors.messageUnsent();
    }
    const reactorKey = context.actor.key;
    const existing: { emoji: string }[] = await this.dataSource.query(
      `SELECT emoji FROM chat_group_reactions WHERE message_id = $1 AND reactor_key = $2`,
      [messageId, reactorKey],
    );
    const previous = existing[0]?.emoji ?? null;
    const removing = emoji === null || previous === emoji;

    if (removing && previous === null) {
      return this.current(context, messageId);
    }
    const now = this.clock.now();

    await this.dataSource.transaction(async (manager) => {
      if (removing) {
        await manager.query(
          `DELETE FROM chat_group_reactions WHERE message_id = $1 AND reactor_key = $2`,
          [messageId, reactorKey],
        );
      } else {
        await manager.query(
          `INSERT INTO chat_group_reactions (message_id, reactor_key, emoji, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (message_id, reactor_key)
           DO UPDATE SET emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at`,
          [messageId, reactorKey, emoji, now],
        );
      }
      await this.queries.touch(manager, groupId, messageId, now);
    });
    return this.finish(context, stored);
  }

  // Own messages only; the previous body is kept for the history sheet.
  // Saving the same text again is not an edit.
  async edit(
    auth: AuthActor,
    groupId: number,
    messageId: number,
    body: string,
  ) {
    const context = await this.access.load(auth, groupId);

    this.access.requireWrite(context, { ignoreManagersOnly: true });
    const stored = await this.requireMessage(context, messageId);

    if (stored.senderKey !== context.actor.key) {
      throw groupErrors.notYourMessage();
    }
    if (stored.deletedAt !== null) {
      throw groupErrors.messageUnsent();
    }
    if (stored.stickerRef !== null) {
      throw groupErrors.stickerNotEditable();
    }
    if (stored.body === body) {
      return this.current(context, messageId);
    }
    const now = this.clock.now();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO chat_group_message_edits (message_id, previous_body, edited_at)
         VALUES ($1, $2, $3)`,
        [messageId, stored.body, now],
      );
      await manager.query(
        `UPDATE chat_group_messages SET body = $1, edited_at = $2 WHERE id = $3`,
        [body, now, messageId],
      );
      await this.queries.touch(manager, groupId, messageId, now);
    });
    return this.finish(context, stored);
  }

  // Unsend for everyone: the flag only (deleted_at); text, sticker and photos
  // stay stored (company #213), readers blank them. Idempotent. A restricted
  // trainee may still take their own message back.
  async unsend(auth: AuthActor, groupId: number, messageId: number) {
    const context = await this.access.load(auth, groupId);

    this.access.requireWrite(context, {
      ignoreManagersOnly: true,
      allowRestricted: true,
    });
    const stored = await this.requireMessage(context, messageId);

    if (stored.senderKey !== context.actor.key) {
      throw groupErrors.notYourMessage();
    }
    if (stored.deletedAt !== null) {
      return this.current(context, messageId);
    }
    const now = this.clock.now();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE chat_group_messages SET deleted_at = $1 WHERE id = $2`,
        [now, messageId],
      );
      await this.queries.touch(manager, groupId, messageId, now);
    });
    return this.finish(context, stored);
  }

  // A super admin or the creator PT hides (or unhides) anyone's message; the
  // text stays stored for moderation, readers see a placeholder (G14).
  async hide(
    auth: AuthActor,
    groupId: number,
    messageId: number,
    hidden: boolean,
  ) {
    const context = await this.access.load(auth, groupId);

    if (!context.actor.canManage) {
      throw groupErrors.notManager();
    }
    this.access.requireWrite(context, { ignoreManagersOnly: true });
    const stored = await this.requireMessage(context, messageId);

    if (hidden === (stored.hiddenAt !== null)) {
      return this.current(context, messageId);
    }
    const now = this.clock.now();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE chat_group_messages SET hidden_by_key = $1, hidden_at = $2 WHERE id = $3`,
        hidden ? [context.actor.key, now, messageId] : [null, null, messageId],
      );
      await this.queries.touch(manager, groupId, messageId, now);
    });
    return this.finish(context, stored);
  }

  private async finish(context: GroupContext, stored: MessageRow) {
    this.events.publish(GROUP_EVENTS.messageUpdated, {
      groupId: context.group.id,
      messageId: stored.id,
      audience: stored.audience,
    } satisfies GroupMessageUpdatedEvent);
    return this.current(context, stored.id);
  }

  private async current(context: GroupContext, messageId: number) {
    const message = await this.views.one(
      context.group.id,
      messageId,
      context.actor,
    );

    if (!message) {
      throw groupErrors.messageNotFound();
    }
    return message;
  }

  // --- Read cursor ----------------------------------------------------------

  // Reading stays possible whatever the chat switch, a restriction or a
  // dissolve says. The cursor only moves forward, never past the newest
  // message, and always names a message of this group (or stays NULL): the
  // stored value is the newest message of the group at or below the
  // requested id. A super admin's state row is created on the way (G2).
  async markRead(auth: AuthActor, groupId: number, requested: number) {
    const { group, actor } = await this.access.load(auth, groupId);
    const ceiling = Math.min(requested, group.lastMessageId ?? 0);
    const now = this.clock.now();
    const rows = returnedRows<{ lastReadMessageId: number | null }>(
      await this.dataSource.query(
        `INSERT INTO chat_group_members
           (group_id, member_key, added_by_key, joined_at, last_read_message_id)
         VALUES ($1, $2, $2, $3,
           (SELECT max(id) FROM chat_group_messages WHERE group_id = $1 AND id <= $4))
         ON CONFLICT (group_id, member_key) DO UPDATE
           SET last_read_message_id = NULLIF(GREATEST(
             COALESCE(chat_group_members.last_read_message_id, 0),
             COALESCE(EXCLUDED.last_read_message_id, 0)), 0)
         RETURNING last_read_message_id AS "lastReadMessageId"`,
        [group.id, actor.key, now, ceiling],
      ),
    );
    const saved = rows[0]?.lastReadMessageId ?? 0;

    this.events.publish(GROUP_EVENTS.read, {
      groupId: group.id,
      readerKey: actor.key,
      lastReadMessageId: saved,
    } satisfies GroupReadEvent);
    return saved;
  }
}
