import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { GroupSummary } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AdminActor, AuthActor } from "../auth/actor.js";
import { GroupAccess, groupSessionOf } from "./group.access.js";
import {
  groupAvatarUrl,
  toGroupHeader,
  toLastMessage,
} from "./group.mapper.js";
import { GroupQueries } from "./group.queries.js";
import { GroupMessagesService } from "./group-messages.service.js";
import { GroupNames } from "./group-names.service.js";

// The group lists (company group-queries.ts listGroupsForSession,
// countGroupUnread, listGroupMembers and group-candidates.ts).
@Injectable()
export class GroupInboxService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: GroupAccess,
    private readonly queries: GroupQueries,
    private readonly names: GroupNames,
    private readonly messages: GroupMessagesService,
  ) {}

  // The caller's groups, newest first: a super admin every group that is not
  // dissolved, everyone else their active memberships. An alert never
  // becomes anyone's preview (it does not move last_message_id).
  async list(auth: AuthActor): Promise<GroupSummary[]> {
    const session = groupSessionOf(auth);
    const key = `${session.kind}:${session.id}`;
    const isSuper = session.kind === "admin" && session.role === "super_admin";
    const groups = await this.queries.visibleGroups(session);
    const ids = groups.map((group) => group.id);
    const [unread, muted, lastRows] = await Promise.all([
      this.queries.unreadByGroup(session, ids),
      this.queries.mutedGroupIds(key, ids),
      this.queries.lastMessages(
        groups.flatMap((group) =>
          group.lastMessageId === null ? [] : [group.lastMessageId],
        ),
        isSuper,
      ),
    ]);
    const last = new Map(lastRows.map((row) => [row.id, toLastMessage(row)]));

    return groups
      .map((group): GroupSummary => ({
        id: group.id,
        name: group.name,
        avatarUrl: groupAvatarUrl(group),
        managersOnly: group.managersOnly,
        muted: muted.has(group.id),
        unread: unread.get(group.id) ?? 0,
        canManage:
          isSuper || (session.kind === "admin" && group.createdByKey === key),
        dissolved: group.dissolvedAt !== null,
        lastMessage:
          group.lastMessageId === null
            ? null
            : (last.get(group.lastMessageId) ?? null),
        lastMessageAt: group.lastMessageAt?.toISOString() ?? null,
      }))
      .sort(
        (a, b) =>
          (b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0) -
            (a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0) || b.id - a.id,
      );
  }

  // Badge poll: total and per group; system lines and alerts never count,
  // mute does not change it.
  async unread(auth: AuthActor) {
    const session = groupSessionOf(auth);
    const groups = await this.queries.visibleGroups(session);
    const unread = await this.queries.unreadByGroup(
      session,
      groups.map((group) => group.id),
    );
    const perGroup = groups
      .map((group) => ({
        groupId: group.id,
        unread: unread.get(group.id) ?? 0,
      }))
      .filter((row) => row.unread > 0)
      .sort((a, b) => a.groupId - b.groupId);

    return {
      total: perGroup.reduce((sum, row) => sum + row.unread, 0),
      perGroup,
    };
  }

  // The info page (group info for managers, member info for trainees): the
  // header, what the viewer may do and the members, labelled by role.
  async info(auth: AuthActor, groupId: number) {
    const context = await this.access.load(auth, groupId);
    const { group, actor } = context;
    const [keys, member] = await Promise.all([
      this.queries.memberKeys(group.id),
      this.queries.findMember(group.id, actor.key),
    ]);
    const { identities, nameOf } = await this.names.shown(actor.key, keys);

    return {
      group: toGroupHeader(group),
      viewer: this.messages.viewerOf(context, member?.mutedAt ?? null),
      members: keys.flatMap((key) => {
        const identity = identities.get(key);
        const [kind, rawId] = key.split(":");

        return identity
          ? [
              {
                key,
                kind: kind as "user" | "admin",
                id: Number(rawId),
                role: identity.role,
                name: nameOf(key) ?? identity.name,
                avatarUrl: identity.avatarUrl,
                isCreator: key === group.createdByKey,
              },
            ]
          : [];
      }),
    };
  }

  // Who the create and add pickers offer (G1): a PT their own trainees that
  // they have not hidden (all of them while the session revealed hidden
  // trainees, the same rule as the add), a super admin every trainee and
  // every PT. This only
  // fills the list; the add checks the same rule again. With `groupId` the
  // people already in that group are left out.
  async candidates(auth: AdminActor, groupId: number | undefined) {
    const isSuper = auth.role === "super_admin";
    const exclude = new Set(
      groupId === undefined
        ? []
        : (await this.access.find(auth, groupId))
          ? await this.queries.memberKeys(groupId)
          : [],
    );
    const [traineeRows, ptRows]: [
      { id: number; name: string }[],
      { id: number; name: string }[],
    ] = await Promise.all([
      isSuper
        ? this.dataSource.query(
            `SELECT id, name FROM users ORDER BY name_key, id`,
          )
        : this.dataSource.query(
            `SELECT u.id, u.name FROM users u
             WHERE u.pt_admin_id = $1
               AND ($2::boolean OR NOT EXISTS (SELECT 1 FROM admin_hidden_users h
                               WHERE h.admin_id = $1 AND h.user_id = u.id))
             ORDER BY u.name_key, u.id`,
            [auth.id, auth.revealed],
          ),
      isSuper
        ? this.dataSource.query(
            `SELECT id, username AS name FROM admins WHERE role = 'pt'
             ORDER BY username_key, id`,
          )
        : [],
    ]);
    const rows = [
      ...traineeRows.map((row) => ({ ...row, kind: "user" as const })),
      ...ptRows.map((row) => ({ ...row, kind: "admin" as const })),
    ]
      .map((row) => ({ ...row, key: `${row.kind}:${row.id}` }))
      .filter((row) => !exclude.has(row.key));
    const { nameOf } = await this.names.shown(
      `admin:${auth.id}`,
      rows.map((row) => row.key),
    );
    const toCandidate = (row: (typeof rows)[number]) => ({
      key: row.key,
      kind: row.kind,
      id: row.id,
      name: nameOf(row.key) ?? row.name,
    });

    return {
      trainees: rows.filter((row) => row.kind === "user").map(toCandidate),
      pts: rows.filter((row) => row.kind === "admin").map(toCandidate),
    };
  }
}
