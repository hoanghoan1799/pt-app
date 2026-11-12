import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type CreateTraineeRequest,
  MEMBER_MESSAGES,
  PT_MESSAGES,
  toNameKey,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import { badRequest, conflict } from "../auth/auth.errors.js";
import { PasswordHasher } from "../auth/password-hash.js";
import { SessionsService } from "../auth/sessions.service.js";
import { Clock } from "../common/clock.js";
import { isUniqueViolation, notFoundError } from "../common/errors.js";
import { Admin } from "../database/entities/admin.entity.js";
import { User } from "../database/entities/user.entity.js";
import { generatePassword, toEmailKey } from "./generate-password.js";
import { TraineeDeletionService } from "./trainee-deletion.service.js";

// Whole seconds, so it compares cleanly with a session's creation time.
const inWholeSeconds = (date: Date) =>
  new Date(Math.floor(date.getTime() / 1000) * 1000);

// Use cases on trainees: create, email, password reset, PT assignment, delete.
// The PtScopeGuard has already decided who may touch which trainee.
@Injectable()
export class TraineesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
    private readonly deletion: TraineeDeletionService,
  ) {}

  private get users() {
    return this.dataSource.getRepository(User);
  }

  // A PT always gets their own workspace, whatever the request says; a super
  // admin may leave it empty or pick an existing PT account (W1).
  private async resolvePt(admin: AdminActor, requested: number | null) {
    if (admin.role !== "super_admin") {
      return admin.id;
    }
    if (requested === null) {
      return null;
    }
    await this.requirePt(requested);
    return requested;
  }

  private async requirePt(id: number) {
    const exists = await this.dataSource
      .getRepository(Admin)
      .exists({ where: { id, role: "pt" } });

    if (!exists) {
      throw notFoundError("PT_NOT_FOUND", PT_MESSAGES.PT_NOT_FOUND);
    }
  }

  // The password goes back once and is never stored or logged in plain text.
  async create(admin: AdminActor, input: CreateTraineeRequest) {
    const ptAdminId = await this.resolvePt(admin, input.ptAdminId ?? null);
    const nameKey = toNameKey(input.name);
    const emailKey = toEmailKey(input.email);

    if (await this.users.exists({ where: { nameKey } })) {
      throw conflict("NAME_TAKEN", MEMBER_MESSAGES.NAME_TAKEN);
    }
    if (await this.users.exists({ where: { emailKey } })) {
      throw conflict("EMAIL_TAKEN", MEMBER_MESSAGES.EMAIL_TAKEN);
    }
    const password = generatePassword();

    try {
      const created = await this.users.save(
        this.users.create({
          name: input.name,
          nameKey,
          email: input.email,
          emailKey,
          ptAdminId,
          passwordHash: await this.hasher.hash(password),
          passwordChangedAt: inWholeSeconds(this.clock.now()),
        }),
      );

      return {
        id: created.id,
        name: created.name,
        email: input.email,
        ptAdminId,
        password,
      };
    } catch (error) {
      // Two creates racing past the checks above.
      if (isUniqueViolation(error)) {
        throw conflict("NAME_TAKEN", MEMBER_MESSAGES.NAME_TAKEN);
      }
      throw error;
    }
  }

  // Typo fix: the password and open sessions stay as they are (D11).
  async changeEmail(userId: number, email: string) {
    const emailKey = toEmailKey(email);
    const owner = await this.users.findOne({
      where: { emailKey },
      select: { id: true },
    });

    if (owner && owner.id !== userId) {
      throw conflict("EMAIL_TAKEN", MEMBER_MESSAGES.EMAIL_TAKEN);
    }
    const result = await this.users.update({ id: userId }, { email, emailKey });

    if (result.affected === 0) {
      throw this.notFound();
    }
  }

  // New random password, shown once. Every open session of the trainee ends.
  async resetPassword(userId: number) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, emailKey: true },
    });

    if (!user) {
      throw this.notFound();
    }
    if (!user.emailKey) {
      throw badRequest("NO_LOGIN", MEMBER_MESSAGES.NO_LOGIN);
    }
    const password = generatePassword();

    await this.users.update(
      { id: userId },
      {
        passwordHash: await this.hasher.hash(password),
        passwordChangedAt: inWholeSeconds(this.clock.now()),
      },
    );
    await this.sessions.revokeAll({ kind: "user", id: userId });
    return { password };
  }

  // Super admin only: sets (or clears, with null) the PT of a trainee; the
  // target must be a PT account.
  async assignPt(userId: number, ptAdminId: number | null) {
    if (ptAdminId !== null) {
      await this.requirePt(ptAdminId);
    }
    const result = await this.users.update({ id: userId }, { ptAdminId });

    if (result.affected === 0) {
      throw notFoundError("USER_NOT_FOUND", PT_MESSAGES.USER_NOT_FOUND);
    }
  }

  async remove(userId: number) {
    if (!(await this.deletion.delete(userId))) {
      throw this.notFound();
    }
  }

  private notFound() {
    return notFoundError("TRAINEE_NOT_FOUND", MEMBER_MESSAGES.NOT_FOUND);
  }
}
