import { Injectable } from "@nestjs/common";
import {
  buildGroupActor,
  type GroupActor,
  type GroupSendBlockReason,
  groupSendBlockReason,
  type GroupSession,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { groupErrors, sendBlockError } from "./group.errors.js";
import { GroupQueries, type GroupRow } from "./group.queries.js";

export type GroupContext = {
  group: GroupRow;
  actor: GroupActor;
  // The signed-in caller (chat switch and restriction of a trainee).
  auth: AuthActor;
};

export const groupSessionOf = (auth: AuthActor): GroupSession =>
  auth.kind === "user"
    ? { kind: "user", id: auth.id }
    : { kind: "admin", id: auth.id, role: auth.role };

export type SendBlockOptions = {
  // Reactions, edits, unsend and hide stay possible under managers-only.
  ignoreManagersOnly?: boolean;
  // A restricted trainee may still take their own message back.
  allowRestricted?: boolean;
};

// The only door to a group (company group-access.ts loadGroupActor) for reads,
// writes, photos, the avatar and the sockets. A missing group, a dissolved one
// (except for a super admin), a non-member and a left member all answer "not
// found", so ids cannot be probed.
@Injectable()
export class GroupAccess {
  constructor(private readonly queries: GroupQueries) {}

  async find(auth: AuthActor, groupId: number): Promise<GroupContext | null> {
    const group = await this.queries.findGroup(groupId);

    if (!group) {
      return null;
    }
    const session = groupSessionOf(auth);
    const actor = buildGroupActor({
      session,
      group,
      member: await this.queries.findMember(
        groupId,
        `${session.kind}:${session.id}`,
      ),
    });

    return actor ? { group, actor, auth } : null;
  }

  async load(auth: AuthActor, groupId: number): Promise<GroupContext> {
    const context = await this.find(auth, groupId);

    if (!context) {
      throw groupErrors.groupNotFound();
    }
    return context;
  }

  // Management and membership changes (company withGroup): a dissolved group
  // is "not found" for everyone here, a super admin included.
  async forChange(
    auth: AuthActor,
    groupId: number,
    { manage = false }: { manage?: boolean } = {},
  ): Promise<GroupContext> {
    const context = await this.load(auth, groupId);

    if (context.group.dissolvedAt !== null) {
      throw groupErrors.groupNotFound();
    }
    if (manage && !context.actor.canManage) {
      throw groupErrors.notManager();
    }
    return context;
  }

  // Why this caller may not write into the group right now, or null.
  // `restricted` comes from the session's restriction (loaded with it).
  sendBlock(
    { group, actor, auth }: GroupContext,
    options: SendBlockOptions = {},
  ): GroupSendBlockReason | null {
    return groupSendBlockReason({
      actor,
      dissolved: group.dissolvedAt !== null,
      managersOnly: group.managersOnly,
      chatEnabled: auth.kind === "user" && auth.chatEnabled,
      restricted:
        auth.kind === "user" &&
        auth.restriction !== null &&
        options.allowRestricted !== true,
      ignoreManagersOnly: options.ignoreManagersOnly,
    });
  }

  requireWrite(context: GroupContext, options: SendBlockOptions = {}) {
    const reason = this.sendBlock(context, options);

    if (reason) {
      throw sendBlockError(reason);
    }
  }
}
