import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { HIDDEN_USERS_MESSAGES } from "@pt/contracts";
import { DataSource, In } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import { badRequest } from "../auth/auth.errors.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { ChatQueries } from "../chat/chat.queries.js";
import { AdminHiddenUser } from "../database/entities/admin-hidden-user.entity.js";
import { User } from "../database/entities/user.entity.js";
import { avatarUrl } from "../files/image-rules.js";

// Hiding trainees is a per-admin view setting (KAN-163): the trainee vanishes
// from this admin's lists and pages until they reveal with the passcode.
@Injectable()
export class HiddenUsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly policy: PtScopePolicy,
    private readonly chat: ChatQueries,
  ) {}

  private get hiddenRows() {
    return this.dataSource.getRepository(AdminHiddenUser);
  }

  // Hides trainees for this admin only. Needs a passcode (Q3); unknown ids and
  // trainees outside the workspace are ignored and a repeat is a no-op.
  // Returns how many of the ids are now hidden.
  async hide(admin: AdminActor, userIds: number[]) {
    if (!admin.hasPasscode) {
      throw badRequest(
        "PASSCODE_REQUIRED",
        HIDDEN_USERS_MESSAGES.PASSCODE_REQUIRED,
      );
    }
    const ids = [...new Set(userIds)];
    const rows = await this.dataSource.getRepository(User).find({
      where: { id: In(ids) },
      select: { id: true, ptAdminId: true },
    });
    const inScope = rows.filter((row) =>
      this.policy.isInWorkspace(admin, {
        ptAdminId: row.ptAdminId,
        hidden: false,
      }),
    );

    if (inScope.length > 0) {
      await this.hiddenRows
        .createQueryBuilder()
        .insert()
        .values(inScope.map((row) => ({ adminId: admin.id, userId: row.id })))
        .orIgnore()
        .execute();
    }
    return inScope.length;
  }

  async unhide(adminId: number, userId: number) {
    await this.hiddenRows.delete({ adminId, userId });
  }

  isHidden(adminId: number, userId: number) {
    return this.hiddenRows.exists({ where: { adminId, userId } });
  }

  // Only a revealed session sees who is hidden; everything else answers like an
  // admin with nothing hidden, so it leaks nothing.
  async list(admin: AdminActor) {
    if (!admin.revealed) {
      return [];
    }
    const rows = await this.hiddenRows
      .createQueryBuilder("h")
      .innerJoin(User, "u", "u.id = h.userId")
      .select("u.id", "userId")
      .addSelect("u.name", "userName")
      .addSelect("u.ptAdminId", "ptAdminId")
      .addSelect("u.avatarUpdatedAt", "avatarUpdatedAt")
      .where("h.adminId = :adminId", { adminId: admin.id })
      .orderBy("u.nameKey", "ASC")
      .getRawMany<{
        userId: number;
        userName: string;
        ptAdminId: number | null;
        avatarUpdatedAt: Date | null;
      }>();
    const visible = rows.filter((row) =>
      this.policy.isInWorkspace(admin, {
        ptAdminId: row.ptAdminId,
        hidden: true,
      }),
    );
    // Named like the inbox does: the conversation's shared nickname.
    const nicknames = await this.chat.traineeNicknames(
      visible.map((row) => row.userId),
    );

    return visible.map((row) => ({
      userId: row.userId,
      userName: row.userName,
      displayName: nicknames.get(row.userId)?.trim() || row.userName,
      avatarUrl: avatarUrl("user", row.userId, row.avatarUpdatedAt),
    }));
  }
}
