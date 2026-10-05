import "server-only";

import { asc, between, count, countDistinct, desc, eq, max } from "drizzle-orm";

import { db } from "@/db";
import {
  exerciseCompletions,
  exercises,
  foodEntries,
  users,
  workoutDays,
} from "@/db/schema";
import type {
  ActivityItem,
  MemberProgress,
} from "@/features/dashboard/types/dashboard";
import { getWeekDates } from "@/utils/week";

const toEpochMs = (value: Date | number | null | undefined) =>
  value instanceof Date ? value.getTime() : (value ?? null);

export const getMemberProgress = async (
  weekStart: string,
): Promise<MemberProgress[]> => {
  const dates = getWeekDates(weekStart);
  const inWeek = between(workoutDays.date, dates[0], dates[dates.length - 1]);

  const [members, assignedRows, completedRows, lastActiveRows, nutritionRows] =
    await Promise.all([
      db
        .select({ id: users.id, name: users.name })
        .from(users)
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

  return members.map((member) => {
    const assigned = assignedRows.find((row) => row.userId === member.id);
    const completed = completedRows.find((row) => row.userId === member.id);
    const lastActive = lastActiveRows.find((row) => row.userId === member.id);
    const nutrition = nutritionRows.find((row) => row.userId === member.id);

    return {
      ...member,
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
}

export const getRecentActivity = async ({
  limit,
  userId,
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
    .where(userId ? eq(exerciseCompletions.userId, userId) : undefined)
    .orderBy(desc(exerciseCompletions.completedAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    completedAt: row.completedAt.getTime(),
  }));
};
