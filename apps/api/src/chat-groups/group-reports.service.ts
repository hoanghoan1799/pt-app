import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { ChatEvents } from "../chat/chat.events.js";
import { Clock } from "../common/clock.js";
import { GROUP_EVENTS, type GroupMessageUpdatedEvent } from "./group.events.js";
import { GroupQueries } from "./group.queries.js";

// Who files a report: the social actor's facts that matter here.
export type GroupReporter =
  | { kind: "user"; id: number }
  | { kind: "admin"; id: number; role: "super_admin" | "pt" };

export type ReportedGroupMessage = {
  id: number;
  groupId: number;
  groupName: string;
  senderKey: string | null;
  body: string;
  stickerRef: string | null;
  photoId: number | null;
};

// Reports about group messages (spec G15, company group-report.ts). The
// Social report flow calls these; it needs no other part of group chat, so
// this lives in its own small module, like ChatModerationModule.
@Injectable()
export class GroupReports {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: GroupQueries,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // Any active member may report another member's message. Not your own, not
  // a system line or an alert, not an unsent or hidden one, not one with a
  // deleted sender, and a super admin never reports (they moderate). A
  // non-member, a left member and a dissolved group all answer false, the
  // same as an unknown id.
  async canReport(actor: GroupReporter, messageId: number) {
    if (actor.kind === "admin" && actor.role === "super_admin") {
      return false;
    }
    const key = `${actor.kind}:${actor.id}`;
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM chat_group_messages m
       JOIN chat_groups g ON g.id = m.group_id AND g.dissolved_at IS NULL
       JOIN chat_group_members cm ON cm.group_id = m.group_id
         AND cm.member_key = $2 AND cm.left_at IS NULL
       WHERE m.id = $1 AND m.kind = 'message' AND m.audience IS NULL
         AND m.deleted_at IS NULL AND m.hidden_at IS NULL
         AND m.sender_key IS NOT NULL AND m.sender_key <> $2
         AND (EXISTS (SELECT 1 FROM users u WHERE 'user:' || u.id = m.sender_key)
           OR EXISTS (SELECT 1 FROM admins a WHERE 'admin:' || a.id = m.sender_key))`,
      [messageId, key],
    );

    return rows.length > 0;
  }

  // The "hide" resolution of a report: hides the message for everybody, like
  // a manager's hide, even in a dissolved group (only super admins reach it).
  // Already unsent, already hidden or gone counts as done.
  async hideReported(adminId: number, messageId: number) {
    const now = this.clock.now();
    const done = await this.dataSource.transaction(async (manager) => {
      const rows: { groupId: number }[] = await manager.query(
        `UPDATE chat_group_messages SET hidden_by_key = $1, hidden_at = $2
         WHERE id = $3 AND kind = 'message' AND deleted_at IS NULL AND hidden_at IS NULL
         RETURNING group_id AS "groupId"`,
        [`admin:${adminId}`, now, messageId],
      );
      const groupId = rows[0]?.groupId;

      if (groupId === undefined) {
        return null;
      }
      await this.queries.touch(manager, groupId, messageId, now);
      return groupId;
    });

    if (done !== null) {
      this.events.publish(GROUP_EVENTS.messageUpdated, {
        groupId: done,
        messageId,
        audience: null,
      } satisfies GroupMessageUpdatedEvent);
    }
  }

  // The reported messages that are still there to look at (live: not unsent,
  // not hidden), for the super admin queue.
  async describe(ids: number[]): Promise<ReportedGroupMessage[]> {
    return ids.length === 0
      ? []
      : this.dataSource.query(
          `SELECT m.id, m.group_id AS "groupId", g.name AS "groupName",
                  m.sender_key AS "senderKey", m.body,
                  m.sticker_ref AS "stickerRef", m.photo_id AS "photoId"
           FROM chat_group_messages m JOIN chat_groups g ON g.id = m.group_id
           WHERE m.id = ANY($1::int[]) AND m.kind = 'message'
             AND m.deleted_at IS NULL AND m.hidden_at IS NULL`,
          [ids],
        );
  }
}
