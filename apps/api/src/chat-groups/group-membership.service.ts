import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  AVATAR_MESSAGES,
  type GroupAddOutcome,
  groupAddScopeOutcome,
  groupMemberCapRoom,
  type GroupSystemEvent,
  parseActorRef,
  toAdminRole,
} from "@pt/contracts";
import { DataSource, type EntityManager } from "typeorm";

import type { AdminActor, AuthActor } from "../auth/actor.js";
import { badRequest } from "../auth/auth.errors.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { ChatEvents } from "../chat/chat.events.js";
import { Clock } from "../common/clock.js";
import { payloadTooLargeError } from "../common/errors.js";
import { returnedRows } from "../common/sql.js";
import { decodeAvatarDataUrl } from "../files/image-rules.js";
import { GroupAccess, type GroupContext } from "./group.access.js";
import { groupErrors } from "./group.errors.js";
import {
  GROUP_EVENTS,
  type GroupMembersChangedEvent,
  type GroupMessageSentEvent,
} from "./group.events.js";
import { groupAvatarUrl } from "./group.mapper.js";
import { GroupQueries } from "./group.queries.js";
import { appendSystemLine } from "./group-system-lines.js";

export type GroupAddResult = {
  kind: "user" | "admin";
  // The id as sent (anything the client put in the list).
  id: unknown;
  outcome: GroupAddOutcome;
};

const isId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 999_999_999;

const wholeSeconds = (date: Date) =>
  new Date(Math.floor(date.getTime() / 1000) * 1000);

type Runner = Pick<EntityManager, "query">;

// Creating a group and changing who is in it and how it looks (company
// group-core.ts create / add / remove / leave / rename / photo /
// managers-only / mute and group-membership.ts). Every change writes its
// system line in the same transaction, then publishes the events.
@Injectable()
export class GroupMembershipService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: GroupAccess,
    private readonly queries: GroupQueries,
    private readonly scope: PtScopePolicy,
    private readonly traineeScope: TraineeScopeQueries,
    private readonly events: ChatEvents,
    private readonly clock: Clock,
  ) {}

  // A super admin or a PT names the group; a PT creator is an explicit member
  // (G3), a super admin is implicit. The members are added with the same
  // rules as an add (per-id results).
  async create(
    auth: AdminActor,
    input: { name: string; userIds: unknown[]; ptIds: unknown[] },
  ) {
    const key = `admin:${auth.id}`;
    const now = this.clock.now();
    const groupId = await this.dataSource.transaction(async (manager) => {
      const rows = returnedRows<{ id: number }>(
        await manager.query(
          `INSERT INTO chat_groups (name, created_by_key, created_at)
           VALUES ($1, $2, $3) RETURNING id`,
          [input.name, key, now],
        ),
      );
      const id = rows[0].id;

      if (auth.role === "pt") {
        await manager.query(
          `INSERT INTO chat_group_members (group_id, member_key, added_by_key, joined_at)
           VALUES ($1, $2, $2, $3)`,
          [id, key, now],
        );
      }
      return id;
    });
    const context = await this.access.load(auth, groupId);
    const { results } = await this.addMembers(context, input);

    if (auth.role === "pt") {
      this.publishMembers(groupId, { joined: [key] });
    }
    return { groupId, results };
  }

  // The add endpoint: management rights; nothing added because the group is
  // full answers GROUP_FULL.
  async add(
    auth: AuthActor,
    groupId: number,
    input: { userIds: unknown[]; ptIds: unknown[] },
  ) {
    const context = await this.access.forChange(auth, groupId, {
      manage: true,
    });
    const { results, added } = await this.addMembers(context, input);

    if (
      added.length === 0 &&
      results.some((result) => result.outcome === "cap_reached")
    ) {
      throw groupErrors.groupFull();
    }
    return { results };
  }

  // G1, G3, G7, G9: every id is judged on its own; unknown, out-of-scope,
  // duplicate and over-the-cap ids are skipped with a result, never a crash.
  // The group row is locked for the count and the inserts, so two adds cannot
  // both take the last place. A re-added member keeps the row (left_at
  // cleared, joined_at reset, read cursor kept); a new one starts at the
  // newest message (the full history stays readable, G8).
  private async addMembers(
    { group, actor, auth }: GroupContext,
    input: { userIds: unknown[]; ptIds: unknown[] },
  ) {
    const seen = new Set<string>();
    const candidates = [
      ...input.userIds.map((id) => ({ kind: "user" as const, id })),
      ...input.ptIds.map((id) => ({ kind: "admin" as const, id })),
    ].filter((candidate) => {
      const token = `${candidate.kind}:${String(candidate.id)}`;

      if (seen.has(token)) {
        return false;
      }
      seen.add(token);
      return true;
    });
    const userIds = candidates.flatMap((c) =>
      c.kind === "user" && isId(c.id) ? [c.id] : [],
    );
    const adminIds = candidates.flatMap((c) =>
      c.kind === "admin" && isId(c.id) ? [c.id] : [],
    );
    const [userRows, adminRows]: [
      { id: number }[],
      { id: number; role: string | null }[],
    ] = await Promise.all([
      userIds.length
        ? this.dataSource.query(
            `SELECT id FROM users WHERE id = ANY($1::int[])`,
            [userIds],
          )
        : [],
      adminIds.length
        ? this.dataSource.query(
            `SELECT id, role FROM admins WHERE id = ANY($1::int[])`,
            [adminIds],
          )
        : [],
    ]);
    const existingUsers = new Set(userRows.map((row) => row.id));
    const adminRoles = new Map(
      adminRows.map((row) => [row.id, toAdminRole(row.role)]),
    );
    // A PT may add only trainees they can open (own, not hidden unless
    // revealed); a super admin needs no check.
    const accessible = new Map<number, boolean>();

    if (!actor.isSuperAdmin && auth.kind === "admin") {
      for (const id of existingUsers) {
        const facts = await this.traineeScope.findByUserId(auth.id, id);

        accessible.set(
          id,
          facts !== null && this.scope.canAccessTrainee(auth, facts),
        );
      }
    }
    const now = this.clock.now();
    const results: GroupAddResult[] = [];
    const added: string[] = [];

    const lineId = await this.dataSource.transaction(async (manager) => {
      const locked = returnedRows<{ lastMessageId: number | null }>(
        await manager.query(
          `SELECT last_message_id AS "lastMessageId" FROM chat_groups
           WHERE id = $1 FOR UPDATE`,
          [group.id],
        ),
      );
      const lastMessageId = locked[0]?.lastMessageId ?? null;
      let active = await this.queries.countExplicitMembers(group.id, manager);

      for (const { kind, id } of candidates) {
        const done = (outcome: GroupAddOutcome) =>
          results.push({ kind, id, outcome });

        if (!isId(id)) {
          done("invalid");
          continue;
        }
        if (kind === "user" ? !existingUsers.has(id) : !adminRoles.has(id)) {
          done("not_found");
          continue;
        }
        const refused = groupAddScopeOutcome(
          actor,
          kind === "user"
            ? { kind, accessible: accessible.get(id) ?? false }
            : { kind, isPt: adminRoles.get(id) === "pt" },
        );

        if (refused) {
          done(refused);
          continue;
        }
        const memberKey = `${kind}:${id}`;
        const row = await this.queries.findMember(group.id, memberKey, manager);

        if (row && row.leftAt === null) {
          done("already_member");
          continue;
        }
        if (groupMemberCapRoom(active) < 1) {
          done("cap_reached");
          continue;
        }
        if (row) {
          await manager.query(
            `UPDATE chat_group_members
             SET left_at = NULL, removed_by_key = NULL, added_by_key = $3, joined_at = $4
             WHERE group_id = $1 AND member_key = $2`,
            [group.id, memberKey, actor.key, now],
          );
        } else {
          await manager.query(
            `INSERT INTO chat_group_members
               (group_id, member_key, added_by_key, joined_at, last_read_message_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [group.id, memberKey, actor.key, now, lastMessageId],
          );
        }
        active += 1;
        added.push(memberKey);
        done("added");
      }
      return added.length > 0
        ? appendSystemLine(
            manager,
            group.id,
            { type: "member_added", actorKey: actor.key, memberKeys: added },
            { now },
          )
        : null;
    });

    if (lineId !== null) {
      this.publishMembers(group.id, { joined: added });
      this.publishLine(group.id, lineId);
    }
    return { results, added };
  }

  // A manager removes anyone but a super admin (G2).
  async remove(auth: AuthActor, groupId: number, memberKey: string) {
    const { group, actor } = await this.access.forChange(auth, groupId, {
      manage: true,
    });
    const ref = parseActorRef(memberKey);

    if (
      ref?.kind === "admin" &&
      (await this.queries.adminRole(ref.id)) === "super_admin"
    ) {
      throw groupErrors.cannotRemoveManager();
    }
    if (!(await this.deactivate(group.id, memberKey, actor.key))) {
      throw groupErrors.memberNotFound();
    }
  }

  // A member leaves on their own; a super admin cannot (G2, G7).
  async leave(auth: AuthActor, groupId: number) {
    const { group, actor } = await this.access.forChange(auth, groupId);

    if (actor.isSuperAdmin) {
      throw groupErrors.managerCannotLeave();
    }
    if (!(await this.deactivate(group.id, actor.key, null))) {
      throw groupErrors.groupNotFound();
    }
  }

  // Sets left_at on an active row with one guarded update and writes the
  // "removed" or "left" line with it; false when the person is not an active
  // member (a second call is a no-op). `byKey` null = left on their own.
  async deactivate(groupId: number, memberKey: string, byKey: string | null) {
    const now = this.clock.now();
    const lineId = await this.dataSource.transaction(async (manager) => {
      const rows = returnedRows(
        await manager.query(
          `UPDATE chat_group_members SET left_at = $3, removed_by_key = $4
           WHERE group_id = $1 AND member_key = $2 AND left_at IS NULL
           RETURNING member_key`,
          [groupId, memberKey, now, byKey],
        ),
      );

      if (rows.length === 0) {
        return null;
      }
      return appendSystemLine(
        manager,
        groupId,
        byKey === null
          ? { type: "member_left", memberKey }
          : { type: "member_removed", actorKey: byKey, memberKey },
        { now },
      );
    });

    if (lineId === null) {
      return false;
    }
    this.publishMembers(groupId, { left: [memberKey] });
    this.publishLine(groupId, lineId);
    return true;
  }

  // The same name again is not a rename: no line.
  async rename(auth: AuthActor, groupId: number, name: string) {
    const { group, actor } = await this.access.forChange(auth, groupId, {
      manage: true,
    });

    if (group.name === name) {
      return;
    }
    await this.changeWithLine(
      group.id,
      {
        type: "renamed",
        actorKey: actor.key,
        from: group.name,
        to: name,
      },
      (manager) =>
        manager.query(`UPDATE chat_groups SET name = $1 WHERE id = $2`, [
          name,
          group.id,
        ]),
    );
  }

  async setManagersOnly(auth: AuthActor, groupId: number, enabled: boolean) {
    const { group, actor } = await this.access.forChange(auth, groupId, {
      manage: true,
    });

    if (group.managersOnly === enabled) {
      return;
    }
    await this.changeWithLine(
      group.id,
      { type: "managers_only", actorKey: actor.key, enabled },
      (manager) =>
        manager.query(
          `UPDATE chat_groups SET managers_only = $1 WHERE id = $2`,
          [enabled, group.id],
        ),
    );
  }

  // A validated 256x256 data URL (the avatar rules of users and admins), or
  // null to remove the photo. Either writes the "photo changed" line.
  async setAvatar(auth: AuthActor, groupId: number, dataUrl: string | null) {
    if (dataUrl !== null) {
      const decoded = decodeAvatarDataUrl(dataUrl);

      if (!decoded.ok) {
        throw decoded.reason === "too-large"
          ? payloadTooLargeError("AVATAR_TOO_LARGE", AVATAR_MESSAGES.TOO_LARGE)
          : badRequest("AVATAR_INVALID", AVATAR_MESSAGES.INVALID);
      }
    }
    const { group, actor } = await this.access.forChange(auth, groupId, {
      manage: true,
    });
    const updatedAt = dataUrl === null ? null : wholeSeconds(this.clock.now());

    await this.changeWithLine(
      group.id,
      { type: "avatar_changed", actorKey: actor.key },
      (manager) =>
        manager.query(
          `UPDATE chat_groups SET avatar = $1, avatar_updated_at = $2 WHERE id = $3`,
          [dataUrl, updatedAt, group.id],
        ),
    );
    return groupAvatarUrl({ id: group.id, avatarUpdatedAt: updatedAt });
  }

  // Mute own notifications (any member, a super admin's lazy state row too);
  // also allowed in a dissolved group for a super admin, like company.
  async setMuted(auth: AuthActor, groupId: number, muted: boolean) {
    const { group, actor } = await this.access.load(auth, groupId);
    const now = this.clock.now();

    await this.dataSource.query(
      `INSERT INTO chat_group_members (group_id, member_key, added_by_key, joined_at, muted_at)
       VALUES ($1, $2, $2, $3, $4)
       ON CONFLICT (group_id, member_key) DO UPDATE SET muted_at = EXCLUDED.muted_at`,
      [group.id, actor.key, now, muted ? now : null],
    );
  }

  // Super admin only (G6): soft, the data stays, the group leaves every list
  // and writes stop. A second call is a no-op.
  async dissolve(auth: AdminActor, groupId: number) {
    const group = await this.queries.findGroup(groupId);

    if (!group) {
      throw groupErrors.groupNotFound();
    }
    const rows = returnedRows(
      await this.dataSource.query(
        `UPDATE chat_groups SET dissolved_at = $2, dissolved_by_admin_id = $3
         WHERE id = $1 AND dissolved_at IS NULL RETURNING id`,
        [groupId, this.clock.now(), auth.id],
      ),
    );

    if (rows.length > 0) {
      this.events.publish(GROUP_EVENTS.membersChanged, {
        groupId,
        joined: [],
        left: [],
        dissolved: true,
      } satisfies GroupMembersChangedEvent);
    }
  }

  private async changeWithLine(
    groupId: number,
    event: GroupSystemEvent,
    change: (manager: Runner) => Promise<unknown>,
  ) {
    const now = this.clock.now();
    const lineId = await this.dataSource.transaction(async (manager) => {
      await change(manager);
      return appendSystemLine(manager, groupId, event, { now });
    });

    this.publishMembers(groupId, {});
    this.publishLine(groupId, lineId);
  }

  private publishMembers(
    groupId: number,
    { joined = [], left = [] }: { joined?: string[]; left?: string[] },
  ) {
    this.events.publish(GROUP_EVENTS.membersChanged, {
      groupId,
      joined,
      left,
      dissolved: false,
    } satisfies GroupMembersChangedEvent);
  }

  private publishLine(groupId: number, messageId: number) {
    this.events.publish(GROUP_EVENTS.messageSent, {
      groupId,
      messageId,
      kind: "system",
      audience: null,
      push: null,
    } satisfies GroupMessageSentEvent);
  }
}
