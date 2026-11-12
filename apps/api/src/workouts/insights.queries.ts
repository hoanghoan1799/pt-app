import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import {
  type ActivityItem,
  type ActivitySession,
  findPersonalBests,
  type MemberProgress,
  type ProgressSession,
} from "./domain/progress.js";
import { groupSetRows, type SetRow } from "./domain/sets.js";

// "all", "none" (trainees without a PT) or one PT's id.
export type PtFilter = "all" | "none" | number;

// Whose trainees a read may include. Trainees the admin hid are always left
// out (KAN-163); a PT only reaches the trainees of their workspace.
export type AdminScope = { adminId: number; ptOnly: boolean };

type MemberRow = {
  id: number;
  name: string;
  avatarUpdatedAt: Date | null;
  ptAdminId: number | null;
  ptName: string | null;
};

type SessionRow = SetRow & {
  userId: number;
  userName: string;
  exerciseTitle: string;
  youtubeId: string;
  date: string;
};

type ProgressRow = SetRow & {
  userId: number;
  youtubeId: string;
  title: string;
  date: string;
};

const toNumber = (value: string | number) => Number(value);

const toEpochMs = (value: Date | null | undefined) =>
  value ? value.getTime() : 0;

// Read models behind the dashboard, the per-trainee activity feed and the
// weekly progress rows. Raw SQL with positional parameters; nothing from a
// request is ever concatenated into the text.
@Injectable()
export class InsightsQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listMembers(
    scope: AdminScope,
    ptFilter: PtFilter,
  ): Promise<MemberRow[]> {
    return this.dataSource.query(
      `SELECT u.id, u.name, u.avatar_updated_at AS "avatarUpdatedAt",
              u.pt_admin_id AS "ptAdminId", a.username AS "ptName"
       FROM users u LEFT JOIN admins a ON a.id = u.pt_admin_id
       WHERE NOT EXISTS (
               SELECT 1 FROM admin_hidden_users h
               WHERE h.admin_id = $1 AND h.user_id = u.id)
         AND ($2::boolean = false OR u.pt_admin_id = $1)
         AND ($3::text = 'all'
              OR ($3::text = 'none' AND u.pt_admin_id IS NULL)
              OR ($3::text = 'pt' AND u.pt_admin_id = $4::int))
       ORDER BY u.name_key COLLATE "C"`,
      [
        scope.adminId,
        scope.ptOnly,
        typeof ptFilter === "number" ? "pt" : ptFilter,
        typeof ptFilter === "number" ? ptFilter : null,
      ],
    );
  }

  // The week's numbers for these trainees, merged into MemberProgress rows.
  async getMemberProgress(
    members: MemberRow[],
    from: string,
    to: string,
    aliases: ReadonlyMap<number, string>,
  ): Promise<MemberProgress[]> {
    const ids = members.map((member) => member.id);

    if (ids.length === 0) {
      return [];
    }

    const [assignedRows, completedRows, lastActiveRows, nutritionRows]: [
      { userId: number; assigned: string; plannedDays: string }[],
      { userId: number; completed: string; activeDays: string }[],
      { userId: number; lastActiveAt: Date }[],
      { userId: number; nutritionDays: string }[],
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT d.user_id AS "userId", count(e.id) AS assigned,
                count(DISTINCT d.id) AS "plannedDays"
         FROM workout_days d JOIN exercises e ON e.day_id = d.id
         WHERE d.date BETWEEN $1 AND $2 AND d.user_id = ANY($3::int[])
         GROUP BY d.user_id`,
        [from, to, ids],
      ),
      this.dataSource.query(
        `SELECT c.user_id AS "userId", count(c.id) AS completed,
                count(DISTINCT d.id) AS "activeDays"
         FROM exercise_completions c
         JOIN exercises e ON e.id = c.exercise_id
         JOIN workout_days d ON d.id = e.day_id
         WHERE d.date BETWEEN $1 AND $2 AND c.user_id = ANY($3::int[])
         GROUP BY c.user_id`,
        [from, to, ids],
      ),
      this.dataSource.query(
        `SELECT user_id AS "userId", max(completed_at) AS "lastActiveAt"
         FROM exercise_completions WHERE user_id = ANY($1::int[])
         GROUP BY user_id`,
        [ids],
      ),
      this.dataSource.query(
        `SELECT user_id AS "userId", count(DISTINCT date) AS "nutritionDays"
         FROM food_entries
         WHERE date BETWEEN $1 AND $2 AND user_id = ANY($3::int[])
         GROUP BY user_id`,
        [from, to, ids],
      ),
    ]);

    return members.map((member) => {
      const assigned = assignedRows.find((row) => row.userId === member.id);
      const completed = completedRows.find((row) => row.userId === member.id);
      const lastActive = lastActiveRows.find((row) => row.userId === member.id);
      const nutrition = nutritionRows.find((row) => row.userId === member.id);

      return {
        id: member.id,
        name: member.name,
        displayName: aliases.get(member.id)?.trim() || member.name,
        avatarUpdatedAt: member.avatarUpdatedAt,
        ptAdminId: member.ptAdminId,
        ptName: member.ptName,
        assigned: toNumber(assigned?.assigned ?? 0),
        plannedDays: toNumber(assigned?.plannedDays ?? 0),
        completed: toNumber(completed?.completed ?? 0),
        activeDays: toNumber(completed?.activeDays ?? 0),
        lastActiveAt: lastActive?.lastActiveAt ?? null,
        nutritionDays: toNumber(nutrition?.nutritionDays ?? 0),
      };
    });
  }

  // The admin's private nicknames for these trainees, by user id.
  async loadTraineeAliases(
    adminId: number,
    userIds: readonly number[],
  ): Promise<Map<number, string>> {
    const wanted = [...new Set(userIds)];

    if (wanted.length === 0) {
      return new Map();
    }

    const rows: { targetKey: string; alias: string }[] =
      await this.dataSource.query(
        `SELECT target_key AS "targetKey", alias FROM contact_aliases
         WHERE owner_key = $1 AND target_key = ANY($2::text[])`,
        [`admin:${adminId}`, wanted.map((id) => `user:${id}`)],
      );

    return new Map(
      rows.map((row) => [Number(row.targetKey.slice("user:".length)), row.alias]),
    );
  }

  async getRecentCompletions(options: {
    limit: number;
    userId?: number;
    scope?: AdminScope;
  }): Promise<ActivityItem[]> {
    const rows: {
      id: number;
      userId: number;
      userName: string;
      exerciseTitle: string;
      date: string;
      completedAt: Date;
    }[] = await this.dataSource.query(
      `SELECT c.id, u.id AS "userId", u.name AS "userName",
              e.title AS "exerciseTitle", d.date,
              c.completed_at AS "completedAt"
       FROM exercise_completions c
       JOIN exercises e ON e.id = c.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       JOIN users u ON u.id = c.user_id
       WHERE ($1::int IS NULL OR c.user_id = $1)
         AND ($2::int IS NULL OR (
               NOT EXISTS (SELECT 1 FROM admin_hidden_users h
                           WHERE h.admin_id = $2 AND h.user_id = c.user_id)
               AND ($3::boolean = false OR u.pt_admin_id = $2)))
       ORDER BY c.completed_at DESC, c.id DESC
       LIMIT $4`,
      [
        options.userId ?? null,
        options.scope?.adminId ?? null,
        options.scope?.ptOnly ?? false,
        options.limit,
      ],
    );

    return rows.map(({ completedAt, ...row }) => ({
      ...row,
      kind: "completion" as const,
      occurredAt: completedAt.getTime(),
    }));
  }

  // Personal bests among the `limit` exercises whose weighted sets were saved
  // most recently, computed on read (D8). The lookback is not capped: a record
  // must beat every earlier weighted set of the same user + link, so the
  // history query reads all of them up to the window's latest date.
  async getRecentPersonalBests(options: {
    limit: number;
    userId?: number;
    scope?: AdminScope;
  }): Promise<ActivityItem[]> {
    // Only weighted sets can be a record (OQ2), so bodyweight-only sessions do
    // not take window slots.
    const window: {
      exerciseId: number;
      userId: number;
      youtubeId: string;
      date: string;
      lastSavedAt: Date;
    }[] = await this.dataSource.query(
      `SELECT s.exercise_id AS "exerciseId", s.user_id AS "userId",
              e.youtube_id AS "youtubeId", d.date,
              max(s.created_at) AS "lastSavedAt"
       FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       JOIN users u ON u.id = s.user_id
       WHERE s.weight_kg IS NOT NULL
         AND ($1::int IS NULL OR s.user_id = $1)
         AND ($2::int IS NULL OR (
               NOT EXISTS (SELECT 1 FROM admin_hidden_users h
                           WHERE h.admin_id = $2 AND h.user_id = s.user_id)
               AND ($3::boolean = false OR u.pt_admin_id = $2)))
       GROUP BY s.exercise_id, s.user_id, e.youtube_id, d.date
       ORDER BY "lastSavedAt" DESC, s.exercise_id DESC
       LIMIT $4`,
      [
        options.userId ?? null,
        options.scope?.adminId ?? null,
        options.scope?.ptOnly ?? false,
        options.limit,
      ],
    );

    if (window.length === 0) {
      return [];
    }

    const latestDate = window.reduce(
      (date, row) => (row.date > date ? row.date : date),
      window[0].date,
    );
    // A superset (every user x every link of the window); findPersonalBests
    // keeps only the same user + link on earlier dates.
    const rows: SessionRow[] = await this.dataSource.query(
      `SELECT s.exercise_id AS "exerciseId", s.user_id AS "userId",
              u.name AS "userName", e.title AS "exerciseTitle",
              e.youtube_id AS "youtubeId", d.date,
              s.position, s.weight_kg AS "weightKg", s.reps
       FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ANY($1::int[]) AND e.youtube_id = ANY($2::text[])
         AND d.date <= $3
       ORDER BY s.exercise_id ASC, s.position ASC`,
      [
        [...new Set(window.map((row) => row.userId))],
        [...new Set(window.map((row) => row.youtubeId))],
        latestDate,
      ],
    );

    const history = groupSetRows(rows);
    const savedAt = new Map(
      window.map((row) => [row.exerciseId, toEpochMs(row.lastSavedAt)]),
    );
    const windowSessions: ActivitySession[] = history.flatMap((session) => {
      const occurredAt = savedAt.get(session.exerciseId);

      return occurredAt === undefined ? [] : [{ ...session, occurredAt }];
    });

    return findPersonalBests(windowSessions, history);
  }

  // Every logged set of the trainee up to `weekEnd`: "Tiến bộ" compares with
  // all earlier weeks (F4).
  async getProgressSessions(
    userId: number,
    weekEnd: string,
  ): Promise<ProgressSession[]> {
    const rows: ProgressRow[] = await this.dataSource.query(
      `SELECT s.exercise_id AS "exerciseId", s.user_id AS "userId",
              e.youtube_id AS "youtubeId", e.title, d.date,
              s.position, s.weight_kg AS "weightKg", s.reps
       FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       WHERE s.user_id = $1 AND d.user_id = $1 AND d.date <= $2
       ORDER BY s.exercise_id ASC, s.position ASC`,
      [userId, weekEnd],
    );

    return groupSetRows(rows);
  }
}
