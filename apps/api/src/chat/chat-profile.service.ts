import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  adminActorKey,
  type AdminRole,
  CHAT_COLOR_KEYS,
  CHAT_USER_READER_KEY,
  chatAdminReaderKey,
  type ChatColorKey,
  type ChatNicknameRequest,
  chatParseAdminTarget,
  type ChatProfile,
  toAdminRole,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { ChatAccess, type ChatContext } from "./chat.access.js";
import { chatErrors } from "./chat.errors.js";
import {
  CHAT_EVENTS,
  ChatEvents,
  type ChatProfileChangedEvent,
} from "./chat.events.js";
import { ChatPolicy } from "./chat.policy.js";
import { ChatQueries } from "./chat.queries.js";

const isColorKey = (value: unknown): value is ChatColorKey =>
  typeof value === "string" &&
  (CHAT_COLOR_KEYS as readonly string[]).includes(value);

export const EMPTY_PROFILE: ChatProfile = { nicknames: {}, colors: {} };

// Nicknames and bubble colours of a conversation (KAN-141). Nicknames are the
// conversation's own, Messenger style: anyone in it may set or clear the
// nickname of anyone in it (themselves included) and every member sees the
// same ones. The viewer's private contact aliases are never used in chat.
@Injectable()
export class ChatProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: ChatQueries,
    private readonly access: ChatAccess,
    private readonly policy: ChatPolicy,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // `colors` is already resolved: an admin's per-conversation override wins
  // over their account colour. Both sides get the same `nicknames`.
  async load(conversationId: number): Promise<ChatProfile> {
    const [nicknameRows, rows] = await Promise.all([
      this.queries.nicknameRows(conversationId),
      this.queries.colorRows(conversationId),
    ]);
    const colors: Record<string, ChatColorKey> = {};
    const nicknames: Record<string, string> = {};

    for (const row of nicknameRows) {
      nicknames[row.targetKey] = row.nickname;
    }
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
    return { nicknames, colors };
  }

  // Sets (or, with a blank nickname, clears) the nickname of one member of the
  // conversation. Checks in this order: the caller reads the conversation (the
  // context), the chat lock, then the target ("user" and "pt" always belong to
  // the conversation; "admin:<id>" must be an existing admin who may work with
  // its trainee). Saving the stored value again changes nothing. A change is
  // silent: no message and no push, only the profile event so the other
  // members' screens refresh the names.
  async setNickname(context: ChatContext, request: ChatNicknameRequest) {
    const { actor, trainee } = context;

    this.access.requireWrite(context);
    // A locked chat was refused above, so a trainee with chat on has one.
    const conversation = await this.access.ensureConversation(context);

    if (!conversation) {
      throw chatErrors.conversationNotFound();
    }
    const adminId = chatParseAdminTarget(request.target);
    const setByKey =
      actor.kind === "admin" ? adminActorKey(actor.id) : CHAT_USER_READER_KEY;
    const changedAt = await this.dataSource.transaction(async (manager) => {
      // Every check runs on rows this transaction holds until COMMIT, taken
      // in the order a deletion takes them (admin, trainee, conversation), so
      // a concurrent removal, demotion, change of PT or deletion of the
      // conversation either committed first and is seen here, or waits for
      // this write. Never a nickname for somebody who no longer belongs.
      if (adminId !== null) {
        const admin = await this.queries.findAdminForNickname(manager, adminId);
        const facts = await this.queries.lockTraineeForNickname(
          manager,
          trainee.traineeId,
        );

        if (!facts) {
          throw chatErrors.conversationNotFound();
        }
        if (
          !admin ||
          !this.policy.isConversationAdmin(
            { id: admin.id, role: toAdminRole(admin.role) },
            facts,
          )
        ) {
          throw chatErrors.adminNotFound();
        }
      }
      if (!(await this.queries.lockConversation(manager, conversation.id))) {
        throw chatErrors.conversationNotFound();
      }
      const stored = await this.queries.findNickname(
        manager,
        conversation.id,
        request.target,
      );

      if ((stored ?? "") === request.nickname) {
        return null;
      }
      if (request.nickname === "") {
        await this.queries.clearNickname(
          manager,
          conversation.id,
          request.target,
        );
      } else {
        await this.queries.saveNickname(manager, {
          conversationId: conversation.id,
          targetKey: request.target,
          nickname: request.nickname,
          setByKey,
          now: this.clock.now(),
        });
      }
      return this.queries.bumpConversationChange(
        manager,
        conversation.id,
        this.clock.now(),
      );
    });

    if (changedAt) {
      this.events.publish(CHAT_EVENTS.profileChanged, {
        conversationId: conversation.id,
        traineeUserId: trainee.traineeId,
        changedAt: changedAt.getTime(),
      } satisfies ChatProfileChangedEvent);
    }
    return this.load(conversation.id);
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
      return this.load(conversation.id);
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
    return this.load(conversation.id);
  }

  // An account colour changed (users.chat_color / admins.chat_color): move the
  // change cursor of every conversation it shows in, so polling clients see
  // it, and tell the open ones. A trainee's colour touches their own
  // conversation; an admin's the conversations they take part in.
  async accountColorChanged(
    who:
      | { kind: "user"; userId: number }
      | { kind: "admin"; adminId: number; role: AdminRole },
  ) {
    const moved = await this.queries.bumpConversationsOf(
      who.kind === "user"
        ? { traineeUserId: who.userId }
        : { ptAdminId: who.role === "super_admin" ? null : who.adminId },
      this.clock.now(),
    );

    for (const row of moved) {
      this.events.publish(CHAT_EVENTS.profileChanged, {
        conversationId: row.id,
        traineeUserId: row.userId,
        changedAt: row.lastChangeAt.getTime(),
      } satisfies ChatProfileChangedEvent);
    }
    return moved.length;
  }
}
