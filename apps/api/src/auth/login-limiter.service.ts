import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { LoginAttempt } from "../database/entities/login-attempt.entity.js";
import { isRecordLocked, nextFailureState } from "./login-limiter-rules.js";

export const userLimiterKey = (emailKey: string) => `user:${emailKey}`;
export const adminLimiterKey = (usernameKey: string) => `admin:${usernameKey}`;
// Wrong account password in "forgot passcode".
export const passcodeResetLimiterKey = (adminId: number) =>
  `passcode-reset:${adminId}`;
// Wrong passcode typed to reveal hidden trainees. Separate from the lock-screen
// counter, so it never signs the admin out.
export const passcodeRevealLimiterKey = (adminId: number) =>
  `passcode-reveal:${adminId}`;

// The `login_attempts` table is the source of truth for the 5 failures / 15
// minutes rule (the HTTP throttler is only a coarse extra layer).
@Injectable()
export class LoginLimiter {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  async isLocked(key: string) {
    const record = await this.dataSource.getRepository(LoginAttempt).findOne({
      where: { key },
    });

    return isRecordLocked(record, this.clock.now());
  }

  // Row-locked read-modify-write, so parallel wrong guesses all count.
  async recordFailure(key: string) {
    const now = this.clock.now();

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(LoginAttempt)
        .values({ key, failedCount: 0, windowStartedAt: now })
        .orIgnore()
        .execute();

      const record = await manager.findOneOrFail(LoginAttempt, {
        where: { key },
        lock: { mode: "pessimistic_write" },
      });

      await manager.update(
        LoginAttempt,
        { key },
        nextFailureState(record, now),
      );
    });
  }

  async clear(key: string) {
    await this.dataSource.getRepository(LoginAttempt).delete({ key });
  }
}
