import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type GroupPtChangeEvent,
  parseGroupSystemEvent,
  serializeGroupSystemEvent,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import { ChatEvents } from "../chat/chat.events.js";
import { Clock } from "../common/clock.js";
import { returnedRows } from "../common/sql.js";
import { groupErrors } from "./group.errors.js";
import {
  GROUP_EVENTS,
  type GroupMessageSentEvent,
  type GroupMessageUpdatedEvent,
} from "./group.events.js";
import { GroupQueries } from "./group.queries.js";
import { GroupMembershipService } from "./group-membership.service.js";
import { GroupNames } from "./group-names.service.js";
import { appendSystemLine } from "./group-system-lines.js";

// The PT-change alert (G17, company group-system-lines.ts
// recordPtChangeInGroups and group-admin-actions.ts resolvePtChangeAlert): a
// super-admin-only line in every active group of a trainee whose PT really
// changed, resolved once with "Keep" or "Remove from group".
@Injectable()
export class GroupAlertsService {
  private readonly logger = new Logger(GroupAlertsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: GroupQueries,
    private readonly membership: GroupMembershipService,
    private readonly names: GroupNames,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // The caller already ruled out a re-save of the same value. One alert per
  // active (not dissolved) group that has the trainee, superseding an older
  // unresolved alert for the same trainee and group. A trainee outside every
  // group gets none. One broken group never stops the others (or the
  // assignment). Returns how many alerts were written.
  async recordPtChange(
    userId: number,
    fromPtId: number | null,
    toPtId: number | null,
  ) {
    if (fromPtId === toPtId) {
      return 0;
    }
    const groups: { groupId: number }[] = await this.dataSource.query(
      `SELECT cm.group_id AS "groupId" FROM chat_group_members cm
       JOIN chat_groups g ON g.id = cm.group_id
       WHERE cm.member_key = $1 AND cm.left_at IS NULL AND g.dissolved_at IS NULL
       ORDER BY cm.group_id`,
      [`user:${userId}`],
    );
    const alert: GroupPtChangeEvent = {
      type: "pt_changed",
      userId,
      fromPtId,
      toPtId,
      resolution: null,
    };
    let written = 0;

    for (const { groupId } of groups) {
      try {
        const now = this.clock.now();
        const superseded: number[] = [];
        const id = await this.dataSource.transaction(async (manager) => {
          const older: { id: number; systemEvent: string }[] =
            await manager.query(
              `SELECT id, system_event AS "systemEvent" FROM chat_group_messages
               WHERE group_id = $1 AND kind = 'system' AND audience = 'super_admin'`,
              [groupId],
            );

          for (const row of older) {
            const event = parseGroupSystemEvent(row.systemEvent);

            if (
              event?.type === "pt_changed" &&
              event.userId === userId &&
              event.resolution === null
            ) {
              // Compare-and-swap on the stored text: a super admin resolving
              // it at the same moment wins and the line stays theirs.
              const changed = returnedRows(
                await manager.query(
                  `UPDATE chat_group_messages SET system_event = $1
                 WHERE id = $2 AND system_event = $3 RETURNING id`,
                  [
                    serializeGroupSystemEvent({
                      ...event,
                      resolution: {
                        choice: "superseded",
                        byAdminId: null,
                        at: now.getTime(),
                      },
                    }),
                    row.id,
                    row.systemEvent,
                  ],
                ),
              );

              if (changed.length > 0) {
                await this.queries.touch(manager, groupId, row.id, now);
                superseded.push(row.id);
              }
            }
          }
          return appendSystemLine(manager, groupId, alert, {
            now,
            audience: "super_admin",
          });
        });

        written += 1;
        // Open threads drop the buttons of the superseded alert.
        for (const messageId of superseded) {
          this.events.publish(GROUP_EVENTS.messageUpdated, {
            groupId,
            messageId,
            audience: "super_admin",
          } satisfies GroupMessageUpdatedEvent);
        }
        this.events.publish(GROUP_EVENTS.messageSent, {
          groupId,
          messageId: id,
          kind: "system",
          audience: "super_admin",
          push: null,
        } satisfies GroupMessageSentEvent);
      } catch (error) {
        this.logger.error(
          `PT-change alert failed for group ${groupId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return written;
  }

  // "Keep" or "Remove from group". One guarded update (a compare-and-swap on
  // the stored event, so it only applies while unresolved); a second tap or a
  // second super admin gets "already handled by <name>". "Remove" also
  // removes the trainee, with the normal "removed" line.
  async resolve(
    auth: AdminActor,
    groupId: number,
    messageId: number,
    choice: "keep" | "remove",
  ) {
    const group = await this.queries.findGroup(groupId);
    const rows: { systemEvent: string | null; audience: string | null }[] =
      group && group.dissolvedAt === null
        ? await this.dataSource.query(
            `SELECT system_event AS "systemEvent", audience FROM chat_group_messages
             WHERE id = $1 AND group_id = $2 AND kind = 'system'`,
            [messageId, groupId],
          )
        : [];
    const row = rows[0];
    const event = row ? parseGroupSystemEvent(row.systemEvent) : null;

    if (
      !row ||
      row.audience !== "super_admin" ||
      event?.type !== "pt_changed"
    ) {
      throw groupErrors.alertNotFound();
    }
    if (event.resolution !== null) {
      throw await this.handled(messageId);
    }
    const now = this.clock.now();
    // The resolution and a "remove" commit together: an alert never says
    // "removed" while the trainee is still in.
    const outcome = await this.dataSource.transaction(async (manager) => {
      const changed = returnedRows(
        await manager.query(
          `UPDATE chat_group_messages SET system_event = $1
           WHERE id = $2 AND system_event = $3 RETURNING id`,
          [
            serializeGroupSystemEvent({
              ...event,
              resolution: { choice, byAdminId: auth.id, at: now.getTime() },
            }),
            messageId,
            row.systemEvent,
          ],
        ),
      );

      if (changed.length === 0) {
        return null;
      }
      await this.queries.touch(manager, groupId, messageId, now);
      return {
        lineId:
          choice === "remove"
            ? await this.membership.deactivateIn(
                manager,
                groupId,
                `user:${event.userId}`,
                `admin:${auth.id}`,
                now,
              )
            : null,
      };
    });

    if (!outcome) {
      throw await this.handled(messageId);
    }
    if (outcome.lineId !== null) {
      this.membership.publishDeparture(
        groupId,
        `user:${event.userId}`,
        outcome.lineId,
      );
    }
    this.events.publish(GROUP_EVENTS.messageUpdated, {
      groupId,
      messageId,
      audience: "super_admin",
    } satisfies GroupMessageUpdatedEvent);
  }

  private async handled(messageId: number) {
    const rows: { systemEvent: string | null }[] = await this.dataSource.query(
      `SELECT system_event AS "systemEvent" FROM chat_group_messages WHERE id = $1`,
      [messageId],
    );
    const event = parseGroupSystemEvent(rows[0]?.systemEvent ?? null);
    const byKey =
      event?.type === "pt_changed" && event.resolution?.byAdminId
        ? `admin:${event.resolution.byAdminId}`
        : null;
    const name = byKey
      ? ((await this.names.identities([byKey])).get(byKey)?.name ?? null)
      : null;

    return groupErrors.alertHandled(name);
  }
}
