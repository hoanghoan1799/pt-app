import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager } from "typeorm";

import {
  attachSetsToWeek,
  groupSetRows,
  type LoggedSet,
  type ScheduleDay,
  type ScheduleDayWithSets,
  type ScheduleExercise,
  type SetRow,
  type SetSession,
} from "./domain/sets.js";
import { eachDate } from "./domain/week.js";

type DayRow = { id: number; date: string; title: string; note: string };

type ExerciseRow = {
  id: number;
  day_id: number;
  title: string;
  description: string;
  sets: number | null;
  reps: string;
  youtube_id: string;
  position: number;
  completed_at: Date | null;
};

type SessionRow = SetRow & { userId: number; youtubeId: string; date: string };

export type OwnedExercise = {
  id: number;
  dayId: number;
  date: string;
  youtubeId: string;
};

const toExercise = (row: ExerciseRow): ScheduleExercise => ({
  id: row.id,
  title: row.title,
  description: row.description,
  sets: row.sets,
  reps: row.reps,
  youtubeId: row.youtube_id,
  position: row.position,
  completedAt: row.completed_at,
});

// Read models for workout days, exercises and logged sets. Every method takes
// the EntityManager so a service can run it inside its transaction (the Unit
// of Work) and read what is stored now, not what a page showed earlier.
@Injectable()
export class ScheduleQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  get manager() {
    return this.dataSource.manager;
  }

  // One entry per calendar date of `from`..`to`, empty days included, with the
  // exercises in order and their completion time.
  async getSchedule(
    em: EntityManager,
    userId: number,
    from: string,
    to: string,
  ): Promise<ScheduleDay[]> {
    const days: DayRow[] = await em.query(
      `SELECT id, date, title, note FROM workout_days
       WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, from, to],
    );
    const exercises: ExerciseRow[] = days.length
      ? await em.query(
          `SELECT e.id, e.day_id, e.title, e.description, e.sets, e.reps,
                  e.youtube_id, e.position, c.completed_at
           FROM exercises e
           LEFT JOIN exercise_completions c ON c.exercise_id = e.id
           WHERE e.day_id = ANY($1::int[])
           ORDER BY e.position ASC, e.id ASC`,
          [days.map((day) => day.id)],
        )
      : [];

    return eachDate(from, to).map((date) => {
      const day = days.find((item) => item.date === date);

      return {
        date,
        title: day?.title ?? "",
        note: day?.note ?? "",
        exercises: day
          ? exercises.filter((row) => row.day_id === day.id).map(toExercise)
          : [],
      };
    });
  }

  // One day with its exercises in order; an empty day when nothing is stored.
  async getDay(
    em: EntityManager,
    userId: number,
    date: string,
  ): Promise<ScheduleDay> {
    const [day] = await this.getSchedule(em, userId, date, date);

    return day;
  }

  // getSchedule plus each exercise's logged sets, last-session hints and
  // record flag (KAN-29). One extra query covers this range's sets and all
  // earlier sessions of its links, so there is no query per exercise.
  async getScheduleWithSets(
    em: EntityManager,
    userId: number,
    from: string,
    to: string,
  ): Promise<ScheduleDayWithSets[]> {
    const days = await this.getSchedule(em, userId, from, to);
    const youtubeIds = [
      ...new Set(
        days.flatMap((day) => day.exercises.map((item) => item.youtubeId)),
      ),
    ];
    const sessions = youtubeIds.length
      ? await this.findSessions(em, userId, youtubeIds, to)
      : [];

    return attachSetsToWeek(days, userId, sessions);
  }

  // The user's logged sets for these links up to `toDate`, one session per
  // exercise.
  async findSessions(
    em: EntityManager,
    userId: number,
    youtubeIds: string[],
    toDate: string,
  ): Promise<SetSession[]> {
    const rows: SessionRow[] = await em.query(
      `SELECT s.exercise_id AS "exerciseId", s.user_id AS "userId",
              e.youtube_id AS "youtubeId", d.date AS "date",
              s.position AS "position", s.weight_kg AS "weightKg",
              s.reps AS "reps"
       FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       WHERE s.user_id = $1 AND d.user_id = $1
         AND e.youtube_id = ANY($2::text[]) AND d.date <= $3`,
      [userId, youtubeIds, toDate],
    );

    return groupSetRows(rows);
  }

  // Earlier sessions of the same user + link, strictly before `date` (D6, D7).
  async findEarlierSessions(
    em: EntityManager,
    userId: number,
    youtubeId: string,
    date: string,
  ): Promise<SetSession[]> {
    const rows: SessionRow[] = await em.query(
      `SELECT s.exercise_id AS "exerciseId", s.user_id AS "userId",
              e.youtube_id AS "youtubeId", d.date AS "date",
              s.position AS "position", s.weight_kg AS "weightKg",
              s.reps AS "reps"
       FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       WHERE s.user_id = $1 AND d.user_id = $1
         AND e.youtube_id = $2 AND d.date < $3`,
      [userId, youtubeId, date],
    );

    return groupSetRows(rows);
  }

  // Dates in the range whose workout day has content: a title, a note or at
  // least one exercise.
  async listDatesWithContent(
    em: EntityManager,
    userId: number,
    from: string,
    to: string,
  ): Promise<string[]> {
    const rows: { date: string }[] = await em.query(
      `SELECT DISTINCT d.date FROM workout_days d
       LEFT JOIN exercises e ON e.day_id = d.id
       WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3
         AND (d.title <> '' OR d.note <> '' OR e.id IS NOT NULL)
       ORDER BY d.date`,
      [userId, from, to],
    );

    return rows.map((row) => row.date);
  }

  // Dates in the range where the trainee logged at least one set.
  async listDatesWithSets(
    em: EntityManager,
    userId: number,
    from: string,
    to: string,
  ): Promise<string[]> {
    const rows: { date: string }[] = await em.query(
      `SELECT DISTINCT d.date FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3
       ORDER BY d.date`,
      [userId, from, to],
    );

    return rows.map((row) => row.date);
  }

  // The exercise when it belongs to this trainee's days.
  async findOwnedExercise(
    em: EntityManager,
    exerciseId: number,
    userId: number,
  ): Promise<OwnedExercise | null> {
    const [row]: OwnedExercise[] = await em.query(
      `SELECT e.id, e.day_id AS "dayId", d.date, e.youtube_id AS "youtubeId"
       FROM exercises e JOIN workout_days d ON d.id = e.day_id
       WHERE e.id = $1 AND d.user_id = $2`,
      [exerciseId, userId],
    );

    return row ?? null;
  }

  // Row lock on the exercise: a save, completion, link change, delete or copy
  // that touches the same exercise waits for this transaction. `share` lets
  // other readers in (completion toggles), `update` is exclusive.
  async lockExercise(
    em: EntityManager,
    exerciseId: number,
    mode: "share" | "update",
  ): Promise<{ id: number; youtubeId: string } | null> {
    const [row]: { id: number; youtubeId: string }[] = await em.query(
      `SELECT id, youtube_id AS "youtubeId" FROM exercises WHERE id = $1
       ${mode === "update" ? "FOR UPDATE" : "FOR SHARE"}`,
      [exerciseId],
    );

    return row ?? null;
  }

  async exerciseHasSets(em: EntityManager, exerciseId: number) {
    const [row]: unknown[] = await em.query(
      `SELECT 1 FROM exercise_sets WHERE exercise_id = $1 LIMIT 1`,
      [exerciseId],
    );

    return row !== undefined;
  }

  async storedSets(em: EntityManager, exerciseId: number) {
    const rows: { weightKg: number | null; reps: number }[] = await em.query(
      `SELECT weight_kg AS "weightKg", reps FROM exercise_sets
       WHERE exercise_id = $1 ORDER BY position ASC`,
      [exerciseId],
    );

    return rows satisfies LoggedSet[];
  }

  // Locks every exercise on the target dates (in id order, so two copies never
  // deadlock), then tells whether any of them holds a logged set. Locking first
  // means a set saved meanwhile either is seen here or waits for the copy.
  async lockAndCheckSets(
    em: EntityManager,
    userId: number,
    dates: string[],
  ): Promise<boolean> {
    await em.query(
      `SELECT e.id FROM exercises e JOIN workout_days d ON d.id = e.day_id
       WHERE d.user_id = $1 AND d.date = ANY($2::text[])
       ORDER BY e.id FOR UPDATE OF e`,
      [userId, dates],
    );

    const [row]: unknown[] = await em.query(
      `SELECT 1 FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN workout_days d ON d.id = e.day_id
       WHERE d.user_id = $1 AND d.date = ANY($2::text[]) LIMIT 1`,
      [userId, dates],
    );

    return row !== undefined;
  }
}
