import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type ExerciseRequest,
  type MoveDirection,
  parseYoutubeId,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Exercise } from "../database/entities/exercise.entity.js";
import { shouldConfirmLinkChange } from "./domain/exercise-rules.js";
import { ScheduleQueries } from "./schedule.queries.js";
import {
  deleteNeedsConfirm,
  ExerciseNotFoundError,
  linkChangeNeedsConfirm,
} from "./workouts.errors.js";

// The request schema already refused a link that is not YouTube.
const videoIdOf = (url: string) => {
  const id = parseYoutubeId(url);

  if (!id) {
    throw new Error("Exercise request reached the service with a bad link");
  }
  return id;
};

// The PT's exercise use cases. Each write that touches an existing exercise
// locks its row first, so a trainee saving sets, a link change, a delete and a
// copy are serialised and each re-checks what is stored now.
@Injectable()
export class ExercisesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: ScheduleQueries,
  ) {}

  // Adds an exercise at the end of the day, creating the day when needed.
  create(userId: number, date: string, body: ExerciseRequest) {
    return this.dataSource.transaction(async (em) => {
      // The upsert row-locks the day, so two creates in a row get distinct
      // positions.
      const [day]: { id: number }[] = await em.query(
        `INSERT INTO workout_days (user_id, date) VALUES ($1, $2)
         ON CONFLICT (user_id, date) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id`,
        [userId, date],
      );
      const [{ next }]: { next: number }[] = await em.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next
         FROM exercises WHERE day_id = $1`,
        [day.id],
      );
      const created = await em.save(
        em.create(Exercise, {
          dayId: day.id,
          userId,
          title: body.title,
          description: body.description,
          sets: body.sets,
          reps: body.reps,
          youtubeId: videoIdOf(body.youtubeUrl),
          position: Number(next),
        }),
      );

      return created;
    });
  }

  // Updates the exercise. A new video link starts a new history: the trainee's
  // logged sets are deleted, but only after the PT confirmed. The completion is
  // kept.
  update(userId: number, exerciseId: number, body: ExerciseRequest) {
    return this.dataSource.transaction(async (em) => {
      if (!(await this.queries.findOwnedExercise(em, exerciseId, userId))) {
        throw new ExerciseNotFoundError();
      }

      // The stored link and the sets are read under the lock, so a set logged
      // meanwhile can't slip past the check (the client's idea of "has sets"
      // is never trusted).
      const stored = await this.queries.lockExercise(em, exerciseId, "update");

      if (!stored) {
        throw new ExerciseNotFoundError();
      }

      const youtubeId = videoIdOf(body.youtubeUrl);

      if (stored.youtubeId !== youtubeId) {
        const hasSets = await this.queries.exerciseHasSets(em, exerciseId);

        if (shouldConfirmLinkChange(stored.youtubeId, youtubeId, hasSets)) {
          if (!body.confirmResetSets) {
            throw linkChangeNeedsConfirm();
          }
          await em.query(`DELETE FROM exercise_sets WHERE exercise_id = $1`, [
            exerciseId,
          ]);
        }
      }

      await em.update(Exercise, exerciseId, {
        title: body.title,
        description: body.description,
        sets: body.sets,
        reps: body.reps,
        youtubeId,
      });

      return em.findOneByOrFail(Exercise, { id: exerciseId });
    });
  }

  // Idempotent: an exercise that is already gone is a success. Logged sets go
  // with the exercise, but only after the PT confirmed.
  async remove(userId: number, exerciseId: number, confirmDeleteSets: boolean) {
    await this.dataSource.transaction(async (em) => {
      if (!(await this.queries.findOwnedExercise(em, exerciseId, userId))) {
        return;
      }
      // Sets are counted under the lock, so a set logged after the PT's page
      // loaded can't be wiped without the warning.
      if (!(await this.queries.lockExercise(em, exerciseId, "update"))) {
        return;
      }
      if (
        (await this.queries.exerciseHasSets(em, exerciseId)) &&
        !confirmDeleteSets
      ) {
        throw deleteNeedsConfirm();
      }
      // Sets and completion go with it (foreign keys cascade).
      await em.delete(Exercise, exerciseId);
    });
  }

  // Swaps the exercise with its neighbour. Missing exercise or an edge is a
  // silent no-op. Renumbering every sibling also repairs gaps (a position is unique in a day, so there are no duplicates). The unique constraint is deferred: the renumbering may pass through a duplicate inside the transaction.
  async move(userId: number, exerciseId: number, direction: MoveDirection) {
    await this.dataSource.transaction(async (em) => {
      const existing = await this.queries.findOwnedExercise(
        em,
        exerciseId,
        userId,
      );

      if (!existing) {
        return;
      }

      const siblings: { id: number }[] = await em.query(
        `SELECT id FROM exercises WHERE day_id = $1
         ORDER BY position ASC, id ASC FOR UPDATE`,
        [existing.dayId],
      );
      const ids = siblings.map((row) => row.id);
      const index = ids.indexOf(exerciseId);

      if (index === -1) {
        return;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= ids.length) {
        return;
      }

      [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];

      for (const [position, id] of ids.entries()) {
        await em.update(Exercise, id, { position });
      }
    });
  }
}
