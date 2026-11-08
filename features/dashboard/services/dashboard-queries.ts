import "server-only";

import {
  and,
  asc,
  between,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  notInArray,
} from "drizzle-orm";

import { db } from "@/db";
import {
  admins,
  exerciseCompletions,
  exercises,
  exerciseSets,
  foodEntries,
  users,
  workoutDays,
} from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { listTraineeNicknames } from "@/features/chat/services/chat-queries";
import { resolveDisplayName } from "@/features/chat/utils/display-name";
import type {
  ActivityItem,
  MemberProgress,
} from "@/features/dashboard/types/dashboard";
import {
  type ActivitySession,
  findPersonalBests,
  mergeActivity,
} from "@/features/dashboard/utils/activity";
import { groupSetRows } from "@/features/workouts/utils/set-rows";
import { outOfScopeUserIdsOf } from "@/services/admin-scope";
import { hiddenUserIdsOf } from "@/services/hidden-users";
import { getWeekDates } from "@/utils/week";

const toEpochMs = (value: Date | number | null | undefined) =>
  value instanceof Date ? value.getTime() : (value ?? null);

// Dashboard filter by PT: everyone, trainees without a PT, or one PT's.
export type PtFilter = "all" | "none" | number;

export const ptFilterCondition = (filter: PtFilter) => {
  if (filter === "all") {
    return undefined;
  }
  return filter === "none"
    ? isNull(users.ptAdminId)
    : eq(users.ptAdminId, filter);
};

// Trainees `adminId` hid are left out (KAN-163), so the list and the totals
// built from it never count them.
export const getMemberProgress = async (
  weekStart: string,
  adminId: number,
  ptFilter: PtFilter = "all",
): Promise<MemberProgress[]> => {
  const dates = getWeekDates(weekStart);
  const inWeek = between(workoutDays.date, dates[0], dates[dates.length - 1]);

  const [members, assignedRows, completedRows, lastActiveRows, nutritionRows] =
    await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          avatarUpdatedAt: users.avatarUpdatedAt,
          ptAdminId: users.ptAdminId,
          ptName: admins.username,
        })
        .from(users)
        .leftJoin(admins, eq(admins.id, users.ptAdminId))
        .where(
          and(
            notInArray(users.id, hiddenUserIdsOf(adminId)),
            notInArray(users.id, outOfScopeUserIdsOf(adminId)),
            ptFilterCondition(ptFilter),
          ),
        )
        .orderBy(asc(users.nameKey)),
      db
        .select({
          userId: workoutDays.userId,
          assigned: count(exercises.id),
          plannedDays: countDistinct(workoutDays.id),
        })
        .from(workoutDays)
        .innerJoin(exercises, eq(exercises.dayId, workoutDays.id))
        .where(inWeek)
        .groupBy(workoutDays.userId),
      db
        .select({
          userId: exerciseCompletions.userId,
          completed: count(exerciseCompletions.id),
          activeDays: countDistinct(workoutDays.id),
        })
        .from(exerciseCompletions)
        .innerJoin(exercises, eq(exercises.id, exerciseCompletions.exerciseId))
        .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
        .where(inWeek)
        .groupBy(exerciseCompletions.userId),
      db
        .select({
          userId: exerciseCompletions.userId,
          lastActiveAt: max(exerciseCompletions.completedAt),
        })
        .from(exerciseCompletions)
        .groupBy(exerciseCompletions.userId),
      db
        .select({
          userId: foodEntries.userId,
          nutritionDays: countDistinct(foodEntries.date),
        })
        .from(foodEntries)
        .where(between(foodEntries.date, dates[0], dates[dates.length - 1]))
        .groupBy(foodEntries.userId),
    ]);

  const nicknames = await listTraineeNicknames(members.map((row) => row.id));

  return members.map(({ avatarUpdatedAt, ...member }) => {
    const assigned = assignedRows.find((row) => row.userId === member.id);
    const completed = completedRows.find((row) => row.userId === member.id);
    const lastActive = lastActiveRows.find((row) => row.userId === member.id);
    const nutrition = nutritionRows.find((row) => row.userId === member.id);

    return {
      ...member,
      displayName: resolveDisplayName(nicknames.get(member.id), member.name),
      avatarUrl: avatarUrl("user", member.id, avatarUpdatedAt),
      assigned: assigned?.assigned ?? 0,
      plannedDays: assigned?.plannedDays ?? 0,
      completed: completed?.completed ?? 0,
      activeDays: completed?.activeDays ?? 0,
      lastActiveAt: toEpochMs(lastActive?.lastActiveAt),
      nutritionDays: nutrition?.nutritionDays ?? 0,
    };
  });
};

interface RecentActivityOptions {
  limit: number;
  userId?: number;
  // Leave out the trainees this admin hid (KAN-163). The per-trainee page
  // passes `userId` and is guarded separately.
  adminId?: number;
}

const getRecentCompletions = async ({
  limit,
  userId,
  adminId,
}: RecentActivityOptions): Promise<ActivityItem[]> => {
  const rows = await db
    .select({
      id: exerciseCompletions.id,
      userId: users.id,
      userName: users.name,
      exerciseTitle: exercises.title,
      date: workoutDays.date,
      completedAt: exerciseCompletions.completedAt,
    })
    .from(exerciseCompletions)
    .innerJoin(exercises, eq(exercises.id, exerciseCompletions.exerciseId))
    .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
    .innerJoin(users, eq(users.id, exerciseCompletions.userId))
    .where(
      and(
        userId ? eq(exerciseCompletions.userId, userId) : undefined,
        adminId === undefined
          ? undefined
          : and(
              notInArray(exerciseCompletions.userId, hiddenUserIdsOf(adminId)),
              notInArray(
                exerciseCompletions.userId,
                outOfScopeUserIdsOf(adminId),
              ),
            ),
      ),
    )
    .orderBy(desc(exerciseCompletions.completedAt))
    .limit(limit);

  return rows.map(({ completedAt, ...row }) => ({
    ...row,
    kind: "completion",
    occurredAt: completedAt.getTime(),
  }));
};

// Personal bests among the `limit` exercises whose sets were saved most
// recently, computed on read (D8). The lookback is not capped: a record must
// beat every earlier weighted set of the same user + link, so the history query
// reads all of them up to the window's latest date (KAN-32 Q2).
const getRecentPersonalBests = async ({
  limit,
  userId,
  adminId,
}: RecentActivityOptions): Promise<ActivityItem[]> => {
  const lastSavedAt = max(exerciseSets.createdAt);
  const window = await db
    .select({
      exerciseId: exerciseSets.exerciseId,
      userId: exerciseSets.userId,
      youtubeId: exercises.youtubeId,
      date: workoutDays.date,
      lastSavedAt,
    })
    .from(exerciseSets)
    .innerJoin(exercises, eq(exercises.id, exerciseSets.exerciseId))
    .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
    // Only weighted sets can be a record (OQ2), so bodyweight-only sessions
    // do not take window slots.
    .where(
      and(
        isNotNull(exerciseSets.weightKg),
        userId ? eq(exerciseSets.userId, userId) : undefined,
        adminId === undefined
          ? undefined
          : and(
              notInArray(exerciseSets.userId, hiddenUserIdsOf(adminId)),
              notInArray(exerciseSets.userId, outOfScopeUserIdsOf(adminId)),
            ),
      ),
    )
    .groupBy(exerciseSets.exerciseId)
    .orderBy(desc(lastSavedAt), desc(exerciseSets.exerciseId))
    .limit(limit);

  if (!window.length) {
    return [];
  }

  const latestDate = window.reduce(
    (date, row) => (row.date > date ? row.date : date),
    window[0].date,
  );
  // A superset (every user x every link of the window); findPersonalBests
  // keeps only the same user + link on earlier dates.
  const rows = await db
    .select({
      exerciseId: exerciseSets.exerciseId,
      userId: exerciseSets.userId,
      userName: users.name,
      exerciseTitle: exercises.title,
      youtubeId: exercises.youtubeId,
      date: workoutDays.date,
      position: exerciseSets.position,
      weightKg: exerciseSets.weightKg,
      reps: exerciseSets.reps,
    })
    .from(exerciseSets)
    .innerJoin(exercises, eq(exercises.id, exerciseSets.exerciseId))
    .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
    .innerJoin(users, eq(users.id, exerciseSets.userId))
    .where(
      and(
        inArray(exerciseSets.userId, [...new Set(window.map((r) => r.userId))]),
        inArray(exercises.youtubeId, [
          ...new Set(window.map((row) => row.youtubeId)),
        ]),
        lte(workoutDays.date, latestDate),
      ),
    )
    .orderBy(asc(exerciseSets.exerciseId), asc(exerciseSets.position));

  const history = groupSetRows(rows);
  const savedAt = new Map(
    window.map((row) => [row.exerciseId, toEpochMs(row.lastSavedAt) ?? 0]),
  );
  const windowSessions: ActivitySession[] = history.flatMap((session) => {
    const occurredAt = savedAt.get(session.exerciseId);

    return occurredAt === undefined ? [] : [{ ...session, occurredAt }];
  });

  return findPersonalBests(windowSessions, history);
};

// Completions and personal bests, newest first (F2, F3). Admin-only: both
// callers are pages under app/admin/(protected) that call requireAdmin().
export const getRecentActivity = async (
  options: RecentActivityOptions,
): Promise<ActivityItem[]> => {
  const [completions, records] = await Promise.all([
    getRecentCompletions(options),
    getRecentPersonalBests(options),
  ]);

  return mergeActivity(completions, records, options.limit);
};
