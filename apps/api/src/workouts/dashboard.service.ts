import { Injectable } from "@nestjs/common";
import { isValidDate, WORKOUT_TIME_ZONE } from "@pt/contracts";

import type { AdminActor } from "../auth/actor.js";
import { Clock } from "../common/clock.js";
import {
  type ActivityItem,
  buildExerciseProgress,
  mergeActivity,
  summarizeWeek,
} from "./domain/progress.js";
import { getTodayDate, getWeekDates, getWeekStart } from "./domain/week.js";
import {
  type AdminScope,
  InsightsQueries,
  type PtFilter,
} from "./insights.queries.js";

const scopeOf = (admin: AdminActor): AdminScope => ({
  adminId: admin.id,
  ptOnly: admin.role === "pt",
});

// Admin-only reads: the dashboard, the recent-activity feeds and the weekly
// progress rows. The caller's role and the trainee scope are applied here and
// in the queries, never taken from the request.
@Injectable()
export class DashboardService {
  constructor(
    private readonly queries: InsightsQueries,
    private readonly clock: Clock,
  ) {}

  // Any date of the week snaps to its Monday; no date means this week.
  resolveWeekStart(week: string | undefined) {
    const today = getTodayDate(WORKOUT_TIME_ZONE, this.clock.now());

    return getWeekStart(week && isValidDate(week) ? week : today);
  }

  // The week's numbers per trainee and their totals. Trainees the admin hid are
  // left out, so the list and the totals never count them. Only a super admin
  // can filter by PT; a PT is already scoped to their own trainees.
  async summary(admin: AdminActor, week: string | undefined, pt: PtFilter) {
    const weekStart = this.resolveWeekStart(week);
    const dates = getWeekDates(weekStart);
    const members = await this.queries.listMembers(
      scopeOf(admin),
      admin.role === "super_admin" ? pt : "all",
    );
    const aliases = await this.queries.loadTraineeAliases(
      admin.id,
      members.map((member) => member.id),
    );
    const progress = await this.queries.getMemberProgress(
      members,
      dates[0],
      dates[dates.length - 1],
      aliases,
    );

    return { weekStart, members: progress, summary: summarizeWeek(progress) };
  }

  // Completions and personal bests across the admin's trainees, newest first.
  async recentActivity(admin: AdminActor, limit: number) {
    const options = { limit, scope: scopeOf(admin) };

    return this.withNames(admin, await this.merge(options));
  }

  // One trainee's feed. The route is scope-guarded, so no admin filter here.
  async traineeActivity(admin: AdminActor, userId: number, limit: number) {
    return this.withNames(admin, await this.merge({ limit, userId }));
  }

  async progress(userId: number, week: string | undefined) {
    const weekStart = this.resolveWeekStart(week);
    const weekEnd = getWeekDates(weekStart)[6];
    const sessions = await this.queries.getProgressSessions(userId, weekEnd);

    return {
      weekStart,
      rows: buildExerciseProgress(sessions, weekStart, weekEnd),
    };
  }

  private async merge(options: {
    limit: number;
    userId?: number;
    scope?: AdminScope;
  }): Promise<ActivityItem[]> {
    const [completions, records] = await Promise.all([
      this.queries.getRecentCompletions(options),
      this.queries.getRecentPersonalBests(options),
    ]);

    return mergeActivity(completions, records, options.limit);
  }

  private async withNames(admin: AdminActor, items: ActivityItem[]) {
    const aliases = await this.queries.loadTraineeAliases(
      admin.id,
      items.map((item) => item.userId),
    );
    const displayNames = new Map(
      [...aliases].flatMap(([id, alias]) =>
        alias.trim() ? [[id, alias.trim()] as const] : [],
      ),
    );

    return { items, displayNames };
  }
}
