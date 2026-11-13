import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  addDays,
  type CopyDayRequest,
  type CopyWeekRequest,
  type DateRangeQuery,
  type SaveWorkoutDayRequest,
  WORKOUT_TIME_ZONE,
} from "@pt/contracts";
import { DataSource, type EntityManager } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import { TraineeNotFoundError } from "../auth/auth.errors.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { Clock } from "../common/clock.js";
import { Exercise } from "../database/entities/exercise.entity.js";
import { WorkoutDay } from "../database/entities/workout-day.entity.js";
import {
  hasDayContent,
  normalizeCopyTargets,
} from "./domain/exercise-rules.js";
import type { ScheduleDay } from "./domain/sets.js";
import { getTodayDate, getWeekDates, getWeekStart } from "./domain/week.js";
import { ScheduleQueries } from "./schedule.queries.js";
import {
  copyDayEmpty,
  copyDayTargetHasSets,
  copyEmpty,
  copySameWeek,
  copyTargetHasSets,
  noTargetDays,
  pastTargetDays,
} from "./workouts.errors.js";
import { WorkoutsPolicy } from "./workouts.policy.js";

// Use cases for workout days: the range read, saving a day and the copy
// operations. A copy is one Unit of Work: it reads its source, checks the
// target and writes inside a single transaction.
@Injectable()
export class WorkoutDaysService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: ScheduleQueries,
    private readonly policy: WorkoutsPolicy,
    private readonly traineeScope: TraineeScopeQueries,
    private readonly clock: Clock,
  ) {}

  getSchedule(userId: number, range: DateRangeQuery) {
    return this.queries.getScheduleWithSets(
      this.dataSource.manager,
      userId,
      range.from,
      range.to,
    );
  }

  // Creates the day or updates its title and note; its exercises stay.
  async saveDay(userId: number, date: string, body: SaveWorkoutDayRequest) {
    await this.dataSource
      .getRepository(WorkoutDay)
      .upsert({ userId, date, title: body.title, note: body.note }, [
        "userId",
        "date",
      ]);

    return { date, title: body.title, note: body.note };
  }

  // Copies the content of the source week onto the target week (a different
  // week, or another trainee). The target week is replaced as a whole, unless
  // the trainee already logged sets in it.
  async copyWeek(admin: AdminActor, userId: number, body: CopyWeekRequest) {
    const sourceWeek = getWeekStart(body.fromWeek);
    const targetWeek = getWeekStart(body.targetDate);
    const targetUserId = body.targetUserId;

    if (
      this.policy.isSameWeekCopy({
        userId,
        targetUserId,
        sourceWeek,
        targetWeek,
      })
    ) {
      throw copySameWeek();
    }

    if (targetUserId !== userId) {
      const facts = await this.traineeScope.findByUserId(
        admin.id,
        targetUserId,
      );

      // Missing, out of the workspace and hidden all answer the same.
      if (!this.policy.canCopyInto(admin, facts)) {
        throw new TraineeNotFoundError();
      }
    }

    const copiedDays = await this.dataSource.transaction(async (em) => {
      const sourceDays = (
        await this.queries.getSchedule(
          em,
          userId,
          sourceWeek,
          addDays(sourceWeek, 6),
        )
      ).filter(hasDayContent);

      if (sourceDays.length === 0) {
        throw copyEmpty();
      }

      const targetDates = getWeekDates(targetWeek);
      const hasSets = await this.queries.lockAndCheckSets(
        em,
        targetUserId,
        targetDates,
      );

      if (!this.policy.mayOverwriteDays(hasSets)) {
        throw copyTargetHasSets();
      }

      await this.deleteDays(em, targetUserId, targetDates);

      for (const day of sourceDays) {
        const offset = getWeekDates(sourceWeek).indexOf(day.date);

        await this.insertDay(
          em,
          targetUserId,
          addDays(targetWeek, offset),
          day,
        );
      }
      return sourceDays.length;
    });

    return { copiedDays, targetUserId, targetWeekStart: targetWeek };
  }

  // Copies one day (title, note, exercises in order) to the chosen dates of
  // the same trainee. A target day that already has a workout is replaced; a
  // target with logged sets refuses the whole request. Completions and sets
  // are not copied.
  async copyDay(userId: number, body: CopyDayRequest) {
    const { dates, hasPast } = normalizeCopyTargets({
      sourceDate: body.date,
      dates: body.dates,
      today: getTodayDate(WORKOUT_TIME_ZONE, this.clock.now()),
    });

    if (dates.length === 0) {
      throw noTargetDays();
    }
    // One past date rejects the whole request, so nothing is written.
    if (hasPast) {
      throw pastTargetDays();
    }

    await this.dataSource.transaction(async (em) => {
      // The source is read inside the write transaction too, so the copy is of
      // what is stored now, not of what the PT's page showed.
      const source = await this.queries.getDay(em, userId, body.date);

      if (!hasDayContent(source)) {
        throw copyDayEmpty();
      }

      const hasSets = await this.queries.lockAndCheckSets(em, userId, dates);

      if (!this.policy.mayOverwriteDays(hasSets)) {
        throw copyDayTargetHasSets();
      }

      await this.deleteDays(em, userId, dates);

      for (const date of dates) {
        await this.insertDay(em, userId, date, source);
      }
    });

    return { copied: dates.length };
  }

  // The copy sheet's month picker marks days that already have a workout and
  // locks the ones with logged sets.
  async copyInfo(userId: number, range: DateRangeQuery) {
    const manager = this.dataSource.manager;
    const [planDates, logDates] = await Promise.all([
      this.queries.listDatesWithContent(manager, userId, range.from, range.to),
      this.queries.listDatesWithSets(manager, userId, range.from, range.to),
    ]);

    return { planDates, logDates };
  }

  // Removes the workout days of `dates`; the exercises, sets and completions
  // under them go with them (foreign keys cascade).
  private async deleteDays(em: EntityManager, userId: number, dates: string[]) {
    await em.query(
      `DELETE FROM workout_days WHERE user_id = $1 AND date = ANY($2::date[])`,
      [userId, dates],
    );
  }

  private async insertDay(
    em: EntityManager,
    userId: number,
    date: string,
    source: ScheduleDay,
  ) {
    const created = await em.insert(WorkoutDay, {
      userId,
      date,
      title: source.title,
      note: source.note,
    });
    const dayId = created.identifiers[0].id as number;

    if (source.exercises.length > 0) {
      await em.insert(
        Exercise,
        source.exercises.map((exercise, position) => ({
          dayId,
          userId,
          title: exercise.title,
          description: exercise.description,
          sets: exercise.sets,
          reps: exercise.reps,
          youtubeId: exercise.youtubeId,
          position,
        })),
      );
    }
  }
}
