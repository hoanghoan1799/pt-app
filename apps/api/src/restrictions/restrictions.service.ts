import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectDataSource } from "@nestjs/typeorm";
import { type BlockUserRequest, computeRestrictionUntil } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import { Clock } from "../common/clock.js";
import { returnedRows } from "../common/sql.js";
import {
  RESTRICTION_EVENTS,
  type TraineeSuspendedEvent,
} from "./restriction.events.js";
import {
  type ActiveRestriction,
  type Row,
  toActive,
} from "./restriction.sql.js";
import { restrictionErrors } from "./restrictions.errors.js";

// Every write to user_restrictions (super admin only; the controller checks
// the role). No data is deleted: lifted rows stay as history.
@Injectable()
export class RestrictionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  // D8: block, or re-block with another level. The documented write path
  // (entity comment, nest-blueprint "user_restrictions"), in one transaction:
  // lock the trainee's users row FOR UPDATE so two blocks queue instead of
  // hitting user_restrictions_one_active, lift every row that is not lifted,
  // then insert. A row lifts at its `until` when that has passed, else now,
  // never before its created_at. Only a row that was still active records the
  // admin who replaced it; one that had run out simply ended.
  async block(
    admin: AdminActor,
    userId: number,
    input: BlockUserRequest,
  ): Promise<ActiveRestriction> {
    const now = this.clock.now();
    const row = await this.dataSource.transaction(async (manager) => {
      const users: unknown[] = await manager.query(
        `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );

      if (users.length === 0) {
        throw restrictionErrors.userNotFound();
      }
      await manager.query(
        `UPDATE user_restrictions
            SET lifted_at = GREATEST(created_at, LEAST($2::timestamptz, COALESCE(until, $2::timestamptz))),
                lifted_by_admin_id = CASE WHEN until IS NULL OR until > $2::timestamptz
                                          THEN $3::int ELSE NULL END
          WHERE user_id = $1 AND lifted_at IS NULL`,
        [userId, now, admin.id],
      );
      const [inserted] = returnedRows<Row>(
        await manager.query(
          `INSERT INTO user_restrictions
             (user_id, level, until, reason, created_by_admin_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, user_id, level, until, reason, created_at`,
          [
            userId,
            input.level,
            computeRestrictionUntil(input.duration, now),
            input.reason,
            admin.id,
            now,
          ],
        ),
      );

      return inserted;
    });

    if (row.level === "suspended") {
      // Open sockets were authenticated before the block: drop them (the
      // reconnect handshake is refused while the suspension lasts).
      this.events?.emit(RESTRICTION_EVENTS.suspended, {
        userId,
      } satisfies TraineeSuspendedEvent);
    }
    return toActive(row);
  }

  // D7: lift early ("Gỡ chặn"), recording when and by whom. 409 when nothing
  // is active (already lifted, run out, or never blocked).
  async lift(admin: AdminActor, userId: number) {
    const now = this.clock.now();
    const rows = returnedRows<{ id: number }>(
      await this.dataSource.query(
        `UPDATE user_restrictions
            SET lifted_at = GREATEST(created_at, $2::timestamptz),
                lifted_by_admin_id = $3
          WHERE user_id = $1 AND lifted_at IS NULL
            AND (until IS NULL OR until > $2::timestamptz)
          RETURNING id`,
        [userId, now, admin.id],
      ),
    );

    if (rows.length === 0) {
      throw restrictionErrors.notRestricted();
    }
  }
}
