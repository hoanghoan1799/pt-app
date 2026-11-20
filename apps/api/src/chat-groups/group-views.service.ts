import { Injectable } from "@nestjs/common";
import {
  type GroupActor,
  type GroupMessageView,
  groupSeenByKeys,
  groupSystemEventKeys,
  parseGroupSystemEvent,
} from "@pt/contracts";

import { toGroupMessageView } from "./group.mapper.js";
import { GroupQueries, type MessageRow } from "./group.queries.js";
import { GroupNames } from "./group-names.service.js";

const byMessage = <T extends { messageId: number }>(rows: T[]) => {
  const map = new Map<number, T[]>();

  for (const row of rows) {
    map.set(row.messageId, [...(map.get(row.messageId) ?? []), row]);
  }
  return map;
};

// Builds what the group thread UI needs for a page of rows in a fixed number
// of queries: reactions, photo sizes, quotes, names (the viewer's nicknames
// first), "Seen by" counts of the viewer's own messages and the names a
// system line mentions.
@Injectable()
export class GroupViews {
  constructor(
    private readonly queries: GroupQueries,
    private readonly names: GroupNames,
  ) {}

  async hydrate(
    rows: MessageRow[],
    groupId: number,
    actor: GroupActor,
  ): Promise<GroupMessageView[]> {
    // Defence in depth: the queries already filtered, but an alert must never
    // leave this module for a non super admin.
    const visible = rows.filter(
      (row) => row.audience === null || actor.isSuperAdmin,
    );

    if (visible.length === 0) {
      return [];
    }
    const ids = visible.map((row) => row.id);
    const replyIds = [
      ...new Set(
        visible.flatMap((row) =>
          row.replyToMessageId === null ? [] : [row.replyToMessageId],
        ),
      ),
    ];
    const [reactions, photos, replies, cursors] = await Promise.all([
      this.queries.reactions(ids),
      this.queries.photos(
        visible
          .filter((row) => row.deletedAt === null && row.hiddenAt === null)
          .map((row) => row.id),
      ),
      this.queries.replyTargets(groupId, replyIds, actor),
      visible.some((row) => row.senderKey === actor.key)
        ? this.queries.readerCursors(groupId)
        : Promise.resolve([]),
    ]);
    const replyPhotos = await this.queries.photos(
      replies
        .filter((row) => row.deletedAt === null && row.hiddenAt === null)
        .map((row) => row.id),
    );
    const eventKeys = visible.flatMap((row) => {
      const event =
        row.kind === "system" ? parseGroupSystemEvent(row.systemEvent) : null;

      return event ? groupSystemEventKeys(event) : [];
    });
    const { identities, nameOf } = await this.names.shown(actor.key, [
      ...eventKeys,
      ...visible.flatMap((row) => (row.senderKey ? [row.senderKey] : [])),
      ...replies.flatMap((row) => (row.senderKey ? [row.senderKey] : [])),
    ]);
    const seenCounts = new Map(
      visible
        .filter((row) => row.kind === "message" && row.senderKey === actor.key)
        .map((row) => [row.id, groupSeenByKeys(row, cursors).length]),
    );
    const context = {
      viewerKey: actor.key,
      identities,
      nameOf,
      reactions: byMessage(reactions),
      photos: byMessage(photos),
      replies: new Map(replies.map((row) => [row.id, row])),
      replyPhotoCounts: new Map(
        [...byMessage(replyPhotos)].map(([id, list]) => [id, list.length]),
      ),
      seenCounts,
    };

    return visible.map((row) =>
      toGroupMessageView(row, context, groupSystemEventKeys),
    );
  }

  async one(groupId: number, messageId: number, actor: GroupActor) {
    const row = await this.queries.message(groupId, messageId, actor);

    return row
      ? ((await this.hydrate([row], groupId, actor))[0] ?? null)
      : null;
  }
}
