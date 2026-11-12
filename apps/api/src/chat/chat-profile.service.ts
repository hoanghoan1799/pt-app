import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  adminActorKey,
  CHAT_COLOR_KEYS,
  CHAT_USER_READER_KEY,
  chatAdminReaderKey,
  chatAliasesToNicknames,
  type ChatColorKey,
  type ChatProfile,
  userActorKey,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { Clock } from "../common/clock.js";
import { ContactAliasesService } from "../contact-aliases/contact-aliases.service.js";
import { ChatAccess, type ChatContext } from "./chat.access.js";
import {
  CHAT_EVENTS,
  ChatEvents,
  type ChatProfileChangedEvent,
} from "./chat.events.js";
import { ChatQueries } from "./chat.queries.js";

const isColorKey = (value: unknown): value is ChatColorKey =>
  typeof value === "string" &&
  (CHAT_COLOR_KEYS as readonly string[]).includes(value);

export const EMPTY_PROFILE: ChatProfile = { nicknames: {}, colors: {} };

// Nicknames and bubble colours of a conversation (KAN-141). Nicknames are the
// VIEWER's private contact aliases for the people in it, never anybody else's.
@Injectable()
export class ChatProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: ChatQueries,
    private readonly access: ChatAccess,
    private readonly aliases: ContactAliasesService,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // `colors` is already resolved: an admin's per-conversation override wins
  // over their account colour.
  async load(
    conversationId: number,
    actor: AuthActor,
    traineeUserId: number,
  ): Promise<ChatProfile> {
    const [aliases, rows] = await Promise.all([
      this.aliases.listFor(actor),
      this.queries.colorRows(conversationId),
    ]);
    const viewerKey =
      actor.kind === "admin" ? adminActorKey(actor.id) : userActorKey(actor.id);
    const colors: Record<string, ChatColorKey> = {};

    if (isColorKey(rows.trainee)) {
      colors[CHAT_USER_READER_KEY] = rows.trainee;
    }
    for (const row of rows.admins) {
      if (isColorKey(row.color)) {
        colors[chatAdminReaderKey(row.id)] = row.color;
      }
    }
    for (const row of rows.overrides) {
      if (isColorKey(row.color)) {
        colors[chatAdminReaderKey(row.adminId)] = row.color;
      }
    }
    return {
      nicknames: chatAliasesToNicknames(new Map(Object.entries(aliases)), {
        viewerKey,
        traineeUserId,
      }),
      colors,
    };
  }

  // An admin's colour for one conversation only; null removes the override.
  // Like sending, a locked chat is read-only.
  async setConversationColor(
    context: ChatContext & { conversation: { id: number } },
    color: ChatColorKey | null,
  ) {
    const { actor, conversation, trainee } = context;

    this.access.requireWrite(context);
    if (actor.kind !== "admin") {
      return this.load(conversation.id, actor, trainee.traineeId);
    }
    const changedAt = await this.dataSource.transaction(async (manager) => {
      if (color === null) {
        await manager.query(
          `DELETE FROM chat_color_overrides WHERE conversation_id = $1 AND admin_id = $2`,
          [conversation.id, actor.id],
        );
      } else {
        await manager.query(
          `INSERT INTO chat_color_overrides (conversation_id, admin_id, color)
           VALUES ($1, $2, $3)
           ON CONFLICT (conversation_id, admin_id) DO UPDATE SET color = EXCLUDED.color`,
          [conversation.id, actor.id, color],
        );
      }
      // Not tied to a message, but it must still defeat the 204 fast path.
      return this.queries.bumpConversationChange(
        manager,
        conversation.id,
        this.clock.now(),
      );
    });

    this.events.publish(CHAT_EVENTS.profileChanged, {
      conversationId: conversation.id,
      traineeUserId: trainee.traineeId,
      changedAt: changedAt.getTime(),
    } satisfies ChatProfileChangedEvent);
    return this.load(conversation.id, actor, trainee.traineeId);
  }
}
