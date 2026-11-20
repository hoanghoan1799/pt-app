import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { isRestrictionActive, type RestrictionLevel } from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import {
  type ActiveRestriction,
  loadActiveRestriction,
  loadActiveRestrictions,
} from "./restriction.sql.js";

export type RestrictionHistoryRow = ActiveRestriction & {
  createdBy: string | null;
  liftedAt: Date | null;
  liftedBy: string | null;
  active: boolean;
};

const HISTORY_LIMIT = 50;

// Read models of user_restrictions for the admin screens. Expiry is computed
// at read time (D6) with Clock.now().
@Injectable()
export class RestrictionQueries {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  // The restriction that applies to one trainee right now, or null. Also the
  // check for writes that do not run in an HTTP request (a socket event).
  findActive(userId: number): Promise<ActiveRestriction | null> {
    return loadActiveRestriction(this.dataSource, userId, this.clock.now());
  }

  // Badge levels of several trainees (the admin list); unblocked are absent.
  async activeLevels(
    userIds: number[],
  ): Promise<Map<number, RestrictionLevel>> {
    const active = await loadActiveRestrictions(
      this.dataSource,
      userIds,
      this.clock.now(),
    );

    return new Map([...active].map(([id, row]) => [id, row.level]));
  }

  // Newest first, the active one included; who blocked and lifted by name.
  async history(userId: number): Promise<RestrictionHistoryRow[]> {
    const now = this.clock.now();
    const rows: {
      id: number;
      user_id: number;
      level: RestrictionLevel;
      until: Date | null;
      reason: string;
      created_at: Date;
      lifted_at: Date | null;
      created_by: string | null;
      lifted_by: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.id, r.user_id, r.level, r.until, r.reason, r.created_at,
              r.lifted_at, c.username AS created_by, l.username AS lifted_by
         FROM user_restrictions r
         LEFT JOIN admins c ON c.id = r.created_by_admin_id
         LEFT JOIN admins l ON l.id = r.lifted_by_admin_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ${HISTORY_LIMIT}`,
      [userId],
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      level: row.level,
      until: row.until,
      reason: row.reason,
      createdAt: row.created_at,
      createdBy: row.created_by,
      liftedAt: row.lifted_at,
      liftedBy: row.lifted_by,
      active: isRestrictionActive(
        { until: row.until, liftedAt: row.lifted_at },
        now,
      ),
    }));
  }
}
