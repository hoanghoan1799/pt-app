import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type DateRangeQuery,
  exerciseSetsSchema,
  WORKOUT_MESSAGES,
  WORKOUT_TIME_ZONE,
} from "@pt/contracts";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { DataSource, type EntityManager } from "typeorm";

import { Clock } from "../common/clock.js";
import { ExerciseSet } from "../database/entities/exercise-set.entity.js";
import { areSetsEqual, isPersonalBest } from "./domain/sets.js";
import { getTodayDate } from "./domain/week.js";
import { type OwnedExercise, ScheduleQueries } from "./schedule.queries.js";
import {
  completionTooEarly,
  ExerciseNotFoundError,
  invalidSets,
} from "./workouts.errors.js";
import { WorkoutsPolicy } from "./workouts.policy.js";

// What a trainee does with their own workouts: read the schedule, log sets,
// mark an exercise done. The trainee is always the session's user, never an id
// from the request.
@Injectable()
export class TraineeWorkoutsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: ScheduleQueries,
    private readonly policy: WorkoutsPolicy,
    private readonly clock: Clock,
    @InjectPinoLogger(TraineeWorkoutsService.name)
    private readonly logger: PinoLogger,
  ) {}

  getSchedule(userId: number, range: DateRangeQuery) {
    return this.queries.getScheduleWithSets(
      this.dataSource.manager,
      userId,
      range.from,
      range.to,
    );
  }

  // Replaces the exercise's logged sets with `rawSets`. Saving at least one set
  // marks the exercise done (Q4); an empty list only clears the sets (D2).
  async saveSets(userId: number, exerciseId: number, rawSets: unknown[]) {
    // `rawSets` comes from the client, so each row is validated here; the first
    // message is returned as the web showed it.
    const parsed = exerciseSetsSchema.safeParse(rawSets);

    if (!parsed.success) {
      throw invalidSets(
        parsed.error.issues[0]?.message ?? WORKOUT_MESSAGES.INVALID_INPUT,
      );
    }

    const exercise = await this.findDueExercise(exerciseId, userId);
    const newSets = parsed.data;

    // The exercise and the stored sets are read under a row lock, so a PT
    // deleting the exercise meanwhile can't leave rows behind. The link is
    // re-checked too: a link change wipes the sets (OQ1), so sets saved against
    // the old link would start the new history with stale data.
    const completedAt = await this.dataSource.transaction(async (em) => {
      const locked = await this.queries.lockExercise(em, exercise.id, "update");

      if (!locked || locked.youtubeId !== exercise.youtubeId) {
        throw new ExerciseNotFoundError();
      }

      const storedSets = await this.queries.storedSets(em, exercise.id);

      // Unchanged sets keep their rows, so `created_at` (the record's
      // "occurred at" in recent activity) isn't bumped by a re-save.
      if (!areSetsEqual(newSets, storedSets)) {
        await em.query(`DELETE FROM exercise_sets WHERE exercise_id = $1`, [
          exercise.id,
        ]);

        if (newSets.length > 0) {
          await em.insert(
            ExerciseSet,
            newSets.map((set, position) => ({
              exerciseId: exercise.id,
              userId,
              position,
              weightKg: set.weightKg,
              reps: set.reps,
            })),
          );
        }
      }

      if (newSets.length > 0) {
        await this.insertCompletion(em, exercise.id, userId);
      }
      return this.readCompletion(em, exercise.id);
    });

    // Read-only and strictly earlier dates, so it never sees the sets above. A
    // failure here must not turn a stored save into an error.
    let personalBest = false;

    if (newSets.length > 0) {
      try {
        personalBest = isPersonalBest(
          newSets,
          await this.queries.findEarlierSessions(
            this.dataSource.manager,
            userId,
            exercise.youtubeId,
            exercise.date,
          ),
          {
            userId,
            youtubeId: exercise.youtubeId,
            date: exercise.date,
          },
        );
      } catch (error) {
        this.logger.error(
          { err: error, exerciseId: exercise.id },
          "saveExerciseSets personalBest failed",
        );
      }
    }

    return { personalBest, completedAt };
  }

  // Sets (not toggles) the state, so a double tap or a retry can't flip it
  // back. Idempotent in both directions.
  async setCompletion(userId: number, exerciseId: number, completed: boolean) {
    const exercise = await this.findDueExercise(exerciseId, userId);

    return this.dataSource.transaction(async (em) => {
      if (completed) {
        // A shared lock on the exercise: a PT deleting it meanwhile waits, so
        // no completion is written for a deleted exercise, and concurrent
        // toggles all see one row (unique exercise_id + ON CONFLICT).
        if (!(await this.queries.lockExercise(em, exercise.id, "share"))) {
          throw new ExerciseNotFoundError();
        }
        await this.insertCompletion(em, exercise.id, userId);
      } else {
        await em.query(
          `DELETE FROM exercise_completions WHERE exercise_id = $1`,
          [exercise.id],
        );
      }
      return this.readCompletion(em, exercise.id);
    });
  }

  // The trainee's own exercise on a day that has come (today or earlier).
  private async findDueExercise(
    exerciseId: number,
    userId: number,
  ): Promise<OwnedExercise> {
    const exercise = await this.queries.findOwnedExercise(
      this.dataSource.manager,
      exerciseId,
      userId,
    );

    if (!exercise) {
      throw new ExerciseNotFoundError();
    }
    if (
      !this.policy.isDue(
        exercise.date,
        getTodayDate(WORKOUT_TIME_ZONE, this.clock.now()),
      )
    ) {
      throw completionTooEarly();
    }
    return exercise;
  }

  private async insertCompletion(
    em: EntityManager,
    exerciseId: number,
    userId: number,
  ) {
    await em.query(
      `INSERT INTO exercise_completions (exercise_id, user_id, completed_at)
       VALUES ($1, $2, $3) ON CONFLICT (exercise_id) DO NOTHING`,
      [exerciseId, userId, this.clock.now()],
    );
  }

  private async readCompletion(em: EntityManager, exerciseId: number) {
    const [row]: { completedAt: Date }[] = await em.query(
      `SELECT completed_at AS "completedAt" FROM exercise_completions
       WHERE exercise_id = $1`,
      [exerciseId],
    );

    return row?.completedAt ?? null;
  }
}
