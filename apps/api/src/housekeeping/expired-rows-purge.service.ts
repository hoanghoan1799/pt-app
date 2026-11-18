import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  LOGIN_WINDOW_MS,
  SOCIAL_FRIEND_REQUEST_WINDOW_MS,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { APP_ENV } from "../config/app-config.module.js";
import type { Env } from "../config/env.schema.js";

export const PURGE_BATCH_SIZE = 1000;
// The first purge after boot, so frequent restarts still purge.
export const PURGE_STARTUP_DELAY_MS = 60_000;

// A rate_limits row is a fixed-window counter whose window length lives in the
// code that writes it. The longest window in use is the friend-request one
// (24 h); no row can still count once it is older than that.
export const RATE_LIMIT_RETENTION_MS = SOCIAL_FRIEND_REQUEST_WINDOW_MS;

export type PurgeResult = { loginAttempts: number; rateLimits: number };

// Deletes the rows of `login_attempts` and `rate_limits` that can no longer
// change an outcome, so both tables stay as small as the traffic of the last
// day instead of growing for ever (every wrong guess for an unknown name
// creates a row; only a successful login removed one).
//
// Dead rows:
//  - login_attempts, lock expired (locked_until <= now): the next failure
//    starts a new window (nextFailureState) and isLocked is false, so the row
//    equals no row.
//  - login_attempts, never locked and the failure window is over
//    (window_started_at <= now - LOGIN_WINDOW_MS): same.
//    A row still locked is kept even when its window is over.
//  - rate_limits, window_started_at <= now - RATE_LIMIT_RETENTION_MS.
//
// Rows go in batches (one short statement each, rows locked by a concurrent
// login attempt are skipped), so a big backlog never holds a long lock.
@Injectable()
export class ExpiredRowsPurge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpiredRowsPurge.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
    @Inject(APP_ENV)
    private readonly env: Pick<Env, "NODE_ENV" | "PURGE_INTERVAL_MINUTES">,
  ) {}

  // Never in the test environment (tests call purge() themselves) and not when
  // the interval is 0.
  onModuleInit() {
    const minutes = this.env.PURGE_INTERVAL_MINUTES;

    if (this.env.NODE_ENV === "test" || minutes === 0) {
      return;
    }
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.runSafely();
    }, PURGE_STARTUP_DELAY_MS);
    this.startupTimer.unref();
    this.timer = setInterval(() => {
      void this.runSafely();
    }, minutes * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runSafely() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.purge();

      if (result.loginAttempts > 0 || result.rateLimits > 0) {
        this.logger.log(
          `purged ${result.loginAttempts} login_attempts and ${result.rateLimits} rate_limits rows`,
        );
      }
    } catch (error) {
      this.logger.error(
        `purge failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      this.running = false;
    }
  }

  async purge(batchSize = PURGE_BATCH_SIZE): Promise<PurgeResult> {
    const now = this.clock.now();
    const windowCutoff = new Date(now.getTime() - LOGIN_WINDOW_MS);
    const rateCutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);

    const loginAttempts =
      (await this.deleteInBatches(
        `SELECT "key" FROM "login_attempts" WHERE "locked_until" IS NOT NULL AND "locked_until" <= $1`,
        "login_attempts",
        now,
        batchSize,
      )) +
      (await this.deleteInBatches(
        `SELECT "key" FROM "login_attempts" WHERE "locked_until" IS NULL AND "window_started_at" <= $1`,
        "login_attempts",
        windowCutoff,
        batchSize,
      ));
    const rateLimits = await this.deleteInBatches(
      `SELECT "key" FROM "rate_limits" WHERE "window_started_at" <= $1`,
      "rate_limits",
      rateCutoff,
      batchSize,
    );

    return { loginAttempts, rateLimits };
  }

  private async deleteInBatches(
    select: string,
    table: string,
    cutoff: Date,
    batchSize: number,
  ) {
    let total = 0;

    for (;;) {
      const rows: { n: number }[] = await this.dataSource.query(
        `WITH gone AS (
           DELETE FROM "${table}" WHERE "key" IN (${select} LIMIT $2 FOR UPDATE SKIP LOCKED)
           RETURNING 1
         ) SELECT count(*)::int AS n FROM gone`,
        [cutoff, batchSize],
      );
      const deleted = rows[0]?.n ?? 0;

      total += deleted;
      if (deleted < batchSize) {
        return total;
      }
    }
  }
}
