import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  adminActorKey,
  ALIAS_MESSAGES,
  aliasTargetSchema,
  aliasValueSchema,
  checkAliasTarget,
  isActorKey,
  parseActorRef,
  PT_ALIAS_TARGET,
  userActorKey,
} from "@pt/contracts";
import { DataSource, In } from "typeorm";

import type { AdminActor, AuthActor } from "../auth/actor.js";
import { badRequest } from "../auth/auth.errors.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { Clock } from "../common/clock.js";
import { notFoundError } from "../common/errors.js";
import { Admin } from "../database/entities/admin.entity.js";
import { ContactAlias } from "../database/entities/contact-alias.entity.js";
import { SocialBlock } from "../database/entities/social-block.entity.js";
import { User } from "../database/entities/user.entity.js";

// Terms version that unlocks the social network (spec T1).
export const CURRENT_TERMS_VERSION = 1;

export const ownerKeyOf = (actor: AuthActor) =>
  actor.kind === "admin" ? adminActorKey(actor.id) : userActorKey(actor.id);

// Private nicknames. The owner always comes from the session, never from the
// request, so one person's aliases can never be read or written through
// another's account.
@Injectable()
export class ContactAliasesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
    private readonly policy: PtScopePolicy,
    private readonly scopeQueries: TraineeScopeQueries,
  ) {}

  private get repo() {
    return this.dataSource.getRepository(ContactAlias);
  }

  // Every alias the owner has set, by target key.
  async listFor(actor: AuthActor): Promise<Record<string, string>> {
    const rows = await this.repo.find({
      where: { ownerKey: ownerKeyOf(actor) },
    });

    return Object.fromEntries(rows.map((row) => [row.targetKey, row.alias]));
  }

  // The owner's aliases for these targets only; targets without one are absent.
  async loadAliases(
    ownerKey: string,
    targetKeys: readonly string[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(targetKeys)];

    if (wanted.length === 0 || !isActorKey(ownerKey)) {
      return new Map();
    }
    const rows = await this.repo.find({
      where: { ownerKey, targetKey: In(wanted) },
    });

    return new Map(rows.map((row) => [row.targetKey, row.alias]));
  }

  // The viewing admin's alias for each trainee, by user id.
  async loadTraineeAliases(adminId: number, userIds: readonly number[]) {
    const aliases = await this.loadAliases(
      adminActorKey(adminId),
      userIds.map(userActorKey),
    );

    return new Map(
      userIds.flatMap((id) => {
        const alias = aliases.get(userActorKey(id));

        return alias ? [[id, alias] as const] : [];
      }),
    );
  }

  // `alias` is the raw input; an empty one clears. Returns what is stored.
  async set(actor: AuthActor, rawTarget: string, rawAlias: unknown) {
    const target = aliasTargetSchema.safeParse(rawTarget);
    const alias = aliasValueSchema.safeParse(rawAlias);

    if (!target.success || !alias.success) {
      throw badRequest("ALIAS_INVALID", ALIAS_MESSAGES.INVALID);
    }
    const ownerKey = ownerKeyOf(actor);
    const targetKey = target.data;
    const check = checkAliasTarget(ownerKey, targetKey);

    if (check === "self") {
      throw badRequest("ALIAS_SELF", ALIAS_MESSAGES.SELF);
    }
    if (check !== "ok") {
      throw this.targetNotFound();
    }
    // Clearing an alias of an account that is gone must still work.
    if (alias.data !== "" && !(await this.canSeeTarget(actor, targetKey))) {
      throw this.targetNotFound();
    }
    await this.store(ownerKey, targetKey, alias.data);
    return { targetKey, alias: alias.data };
  }

  private targetNotFound() {
    return notFoundError(
      "ALIAS_TARGET_NOT_FOUND",
      ALIAS_MESSAGES.TARGET_NOT_FOUND,
    );
  }

  // Saving the stored value changes nothing; an empty alias deletes the row.
  private async store(ownerKey: string, targetKey: string, alias: string) {
    if (alias === "") {
      await this.repo.delete({ ownerKey, targetKey });
      return;
    }
    await this.repo.upsert(
      { ownerKey, targetKey, alias, updatedAt: this.clock.now() },
      ["ownerKey", "targetKey"],
    );
  }

  // May this owner give this target a nickname, i.e. does the target exist and
  // can the owner see them?
  //   trainee owner: the PT side, any PT, or a trainee in the social network
  //   (accepted the terms, not blocked either way).
  //   admin owner: a trainee in their scope and not hidden from them (or
  //   revealed), or any admin.
  private async canSeeTarget(actor: AuthActor, targetKey: string) {
    if (targetKey === PT_ALIAS_TARGET) {
      return actor.kind === "user";
    }
    const target = parseActorRef(targetKey);

    if (!target) {
      return false;
    }
    if (target.kind === "admin") {
      return this.dataSource
        .getRepository(Admin)
        .exists({ where: { id: target.id } });
    }
    if (actor.kind === "admin") {
      return this.adminSeesTrainee(actor, target.id);
    }
    const row = await this.dataSource.getRepository(User).findOne({
      where: { id: target.id },
      select: { id: true, termsVersion: true },
    });

    return (
      row !== null &&
      (row.termsVersion ?? 0) >= CURRENT_TERMS_VERSION &&
      !(await this.isBlockedBetween(actor.id, target.id))
    );
  }

  private async adminSeesTrainee(admin: AdminActor, userId: number) {
    const facts = await this.scopeQueries.findByUserId(admin.id, userId);

    return facts !== null && this.policy.canAccessTrainee(admin, facts);
  }

  private isBlockedBetween(a: number, b: number) {
    return this.dataSource.getRepository(SocialBlock).exists({
      where: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    });
  }
}
