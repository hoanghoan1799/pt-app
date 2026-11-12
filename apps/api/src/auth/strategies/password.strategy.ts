import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { AUTH_MESSAGES } from "@pt/contracts";
import { DataSource } from "typeorm";
import { z } from "zod";

import { Clock } from "../../common/clock.js";
import { Admin } from "../../database/entities/admin.entity.js";
import { User } from "../../database/entities/user.entity.js";
import { InvalidCredentialsError, LoginLockedError } from "../auth.errors.js";
import type {
  CredentialInputs,
  CredentialStrategy,
} from "../credential.strategy.js";
import { toEmailKey, toUsernameKey } from "../keys.js";
import {
  adminLimiterKey,
  LoginLimiter,
  userLimiterKey,
} from "../login-limiter.service.js";
import { PasswordHasher } from "../password-hash.js";
import type { SubjectRef } from "../sessions.queries.js";

// Slows down password guessing (same value as the web, LOGIN_FAILURE_DELAY_MS).
export const LOGIN_FAILURE_DELAY_MS = 600;

const emailShape = z.email();

// Scrypt password check plus the DB-backed lockout (5 failures / 15 minutes),
// for trainees (by email) and admins (by username). Port of loginWithEmailAction
// and loginAdminAction.
@Injectable()
export class PasswordStrategy implements CredentialStrategy<"password"> {
  readonly method = "password" as const;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly limiter: LoginLimiter,
    private readonly clock: Clock,
  ) {}

  async verify(input: CredentialInputs["password"]): Promise<SubjectRef> {
    return input.subject === "user"
      ? this.verifyUser(input.email, input.password)
      : this.verifyAdmin(input.username, input.password);
  }

  private async verifyUser(email: string, password: string) {
    const emailKey = toEmailKey(email);
    const limiterKey = userLimiterKey(emailKey);

    if (await this.limiter.isLocked(limiterKey)) {
      throw new LoginLockedError();
    }

    // A malformed email can never match a stored one: same generic failure.
    const user = emailShape.safeParse(email.trim()).success
      ? await this.dataSource.getRepository(User).findOne({
          where: { emailKey },
          select: { id: true, passwordHash: true },
        })
      : null;

    // Always run one hash check so unknown emails and trainees without a
    // password yet are not faster to reject.
    const correct = await this.hasher.verify(
      password,
      user?.passwordHash ?? (await this.hasher.dummy()),
    );

    if (!user?.passwordHash || !correct) {
      await this.fail(limiterKey);
      throw new InvalidCredentialsError(AUTH_MESSAGES.EMAIL_LOGIN_WRONG);
    }
    await this.limiter.clear(limiterKey);
    return { kind: "user" as const, id: user.id };
  }

  private async verifyAdmin(username: string, password: string) {
    const limiterKey = adminLimiterKey(toUsernameKey(username));

    if (await this.limiter.isLocked(limiterKey)) {
      throw new LoginLockedError();
    }

    const admin = await this.dataSource.getRepository(Admin).findOne({
      where: { usernameKey: toUsernameKey(username) },
      select: { id: true, passwordHash: true },
    });
    const correct = await this.hasher.verify(
      password,
      admin?.passwordHash ?? (await this.hasher.dummy()),
    );

    if (!admin || !correct) {
      await this.fail(limiterKey);
      throw new InvalidCredentialsError(AUTH_MESSAGES.CREDENTIALS_WRONG);
    }
    await this.limiter.clear(limiterKey);
    return { kind: "admin" as const, id: admin.id };
  }

  private async fail(limiterKey: string) {
    await this.limiter.recordFailure(limiterKey);
    await this.clock.sleep(LOGIN_FAILURE_DELAY_MS);
  }
}
