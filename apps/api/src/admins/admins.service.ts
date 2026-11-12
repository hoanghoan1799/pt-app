import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type ChatColorKey,
  type CreatePtRequest,
  PROFILE_MESSAGES,
  PT_MESSAGES,
} from "@pt/contracts";
import { DataSource, IsNull, Not } from "typeorm";

import { conflict } from "../auth/auth.errors.js";
import { PasswordHasher } from "../auth/password-hash.js";
import { Clock } from "../common/clock.js";
import { isUniqueViolation, notFoundError } from "../common/errors.js";
import { Admin } from "../database/entities/admin.entity.js";
import { User } from "../database/entities/user.entity.js";
import { toUsernameKey } from "../users/generate-password.js";
import { toAdminAccount, toAdminProfile } from "../users/trainee.mapper.js";

// Admin accounts (super admin) and the settings an admin keeps on their own
// account.
@Injectable()
export class AdminsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  private get admins() {
    return this.dataSource.getRepository(Admin);
  }

  // Every admin account (super admins and PTs) with their trainee counts.
  async listAccounts() {
    const [rows, counts] = await Promise.all([
      this.admins.find({
        select: { id: true, username: true, role: true, verifiedAt: true },
        order: { id: "ASC" },
      }),
      this.dataSource
        .getRepository(User)
        .createQueryBuilder("u")
        .select("u.ptAdminId", "ptAdminId")
        .addSelect("COUNT(u.id)", "total")
        .where({ ptAdminId: Not(IsNull()) })
        .groupBy("u.ptAdminId")
        .getRawMany<{ ptAdminId: number; total: string }>(),
    ]);
    const countByPt = new Map(
      counts.map((row) => [Number(row.ptAdminId), Number(row.total)]),
    );

    return rows.map((row) => toAdminAccount(row, countByPt.get(row.id) ?? 0));
  }

  // Creates a PT account (role 'pt'), no tick.
  async createPt(input: CreatePtRequest) {
    const usernameKey = toUsernameKey(input.username);

    if (await this.admins.exists({ where: { usernameKey } })) {
      throw this.usernameTaken();
    }
    try {
      const created = await this.admins.save(
        this.admins.create({
          username: input.username,
          usernameKey,
          passwordHash: await this.hasher.hash(input.password),
          role: "pt",
        }),
      );

      return toAdminAccount(created, 0);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw this.usernameTaken();
      }
      throw error;
    }
  }

  // Grants or removes the blue tick of any admin account.
  async setVerified(adminId: number, verified: boolean) {
    const result = await this.admins.update(
      { id: adminId },
      { verifiedAt: verified ? this.clock.now() : null },
    );

    if (result.affected === 0) {
      throw notFoundError("ADMIN_NOT_FOUND", PT_MESSAGES.ADMIN_NOT_FOUND);
    }
  }

  async profile(adminId: number) {
    const row = await this.admins.findOne({
      where: { id: adminId },
      select: {
        id: true,
        username: true,
        role: true,
        verifiedAt: true,
        locale: true,
        bio: true,
        chatColor: true,
        presenceHidden: true,
        avatarUpdatedAt: true,
      },
    });

    if (!row) {
      throw notFoundError("ADMIN_NOT_FOUND", PROFILE_MESSAGES.ADMIN_NOT_FOUND);
    }
    return toAdminProfile(row);
  }

  // The account colour shows in every conversation without an override (the
  // per-conversation colour belongs to the chat module).
  async setChatColor(adminId: number, color: ChatColorKey | null) {
    await this.updateOwn(adminId, { chatColor: color });
    return { color };
  }

  // The "activity status" switch: hides the admin's online status from
  // trainees.
  async setPresenceHidden(adminId: number, isHidden: boolean) {
    await this.updateOwn(adminId, { presenceHidden: isHidden });
    return { presenceHidden: isHidden };
  }

  private async updateOwn(adminId: number, patch: Partial<Admin>) {
    const result = await this.admins.update({ id: adminId }, patch);

    if (result.affected === 0) {
      throw notFoundError("ADMIN_NOT_FOUND", PROFILE_MESSAGES.ADMIN_NOT_FOUND);
    }
  }

  private usernameTaken() {
    return conflict("USERNAME_TAKEN", PT_MESSAGES.USERNAME_TAKEN);
  }
}
