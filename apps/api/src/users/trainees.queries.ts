import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { type ListTraineesQuery, toNameKey } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import { ContactAliasesService } from "../contact-aliases/contact-aliases.service.js";
import { AdminHiddenUser } from "../database/entities/admin-hidden-user.entity.js";
import { User } from "../database/entities/user.entity.js";
import { toTraineeDetail, toTraineeSummary } from "./trainee.mapper.js";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

// Read models of trainees for the admin screens. Never selects the password
// hash or the stored photo.
@Injectable()
export class TraineesQueries {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly aliases: ContactAliasesService,
  ) {}

  // The trainees this admin may work with, leaving out the ones they hid
  // (revealing is a separate list), by name. A PT only gets their own
  // workspace; a super admin everyone, optionally one PT's.
  async list(admin: AdminActor, filter: ListTraineesQuery) {
    const query = this.dataSource
      .getRepository(User)
      .createQueryBuilder("u")
      .select(["u.id", "u.name", "u.ptAdminId", "u.avatarUpdatedAt"])
      .where(
        `NOT EXISTS (SELECT 1 FROM admin_hidden_users h WHERE h.user_id = u.id AND h.admin_id = :adminId)`,
        { adminId: admin.id },
      )
      .orderBy("u.nameKey", "ASC");

    if (admin.role === "pt") {
      query.andWhere("u.ptAdminId = :ptId", { ptId: admin.id });
    } else if (filter.ptAdminId !== undefined) {
      query.andWhere("u.ptAdminId = :ptId", { ptId: filter.ptAdminId });
    }
    const key = filter.q ? toNameKey(filter.q) : "";

    if (key) {
      query.andWhere(`u.nameKey LIKE :q ESCAPE '\\'`, {
        q: `%${escapeLike(key)}%`,
      });
    }
    const rows = await query.getMany();
    const aliases = await this.aliases.loadTraineeAliases(
      admin.id,
      rows.map((row) => row.id),
    );

    return rows.map((row) => toTraineeSummary(row, aliases.get(row.id)));
  }

  // Scope and hiding are already decided by the PtScopeGuard.
  async detail(admin: AdminActor, userId: number) {
    const row = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailKey: true,
        ptAdminId: true,
        avatarUpdatedAt: true,
        chatEnabled: true,
        createdAt: true,
      },
    });

    if (!row) {
      return null;
    }
    const [aliases, hidden] = await Promise.all([
      this.aliases.loadTraineeAliases(admin.id, [userId]),
      this.dataSource
        .getRepository(AdminHiddenUser)
        .exists({ where: { adminId: admin.id, userId } }),
    ]);

    return toTraineeDetail(row, { alias: aliases.get(userId), hidden });
  }
}
