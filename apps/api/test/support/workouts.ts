import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DataSource } from "typeorm";

import { Clock } from "../../src/common/clock.js";
import { Exercise } from "../../src/database/entities/exercise.entity.js";
import { ExerciseCompletion } from "../../src/database/entities/exercise-completion.entity.js";
import { ExerciseSet } from "../../src/database/entities/exercise-set.entity.js";
import { WorkoutDay } from "../../src/database/entities/workout-day.entity.js";
import { createTestApp } from "./app.js";
import {
  bearer,
  FakeClock,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./auth.js";
import { createTestDatabase, type TestDatabase } from "./database.js";

export const LINK_A = "dQw4w9WgXcQ";
export const LINK_B = "9bZkp7q19f0";
// FakeClock starts at 2026-11-12T10:00Z = 17:00 in Ho Chi Minh: a Thursday.
export const TODAY = "2026-11-12";
export const MONDAY = "2026-11-09";

export type World = {
  db: TestDatabase;
  ds: DataSource;
  app: INestApplication;
  clock: FakeClock;
  ids: {
    superAdmin: number;
    ptA: number;
    ptB: number;
    mine: number;
    theirs: number;
    other: number;
  };
  tokens: {
    superAdmin: string;
    ptA: string;
    ptB: string;
    mine: string;
    theirs: string;
  };
};

// One database, one app, a super admin, two PTs and three trainees: `mine`
// (PT A), `other` (PT A) and `theirs` (PT B).
export const createWorld = async (): Promise<World> => {
  const db = await createTestDatabase();
  const clock = new FakeClock();
  const app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: Clock, value: clock }],
  });
  const ds = db.dataSource;
  const superAdmin = await seedAdmin(ds, { role: "super_admin" });
  const ptA = await seedAdmin(ds, { role: "pt" });
  const ptB = await seedAdmin(ds, { role: "pt" });
  const mine = await seedUser(ds, { ptAdminId: ptA.id });
  const other = await seedUser(ds, { ptAdminId: ptA.id });
  const theirs = await seedUser(ds, { ptAdminId: ptB.id });

  return {
    db,
    ds,
    app,
    clock,
    ids: {
      superAdmin: superAdmin.id,
      ptA: ptA.id,
      ptB: ptB.id,
      mine: mine.id,
      theirs: theirs.id,
      other: other.id,
    },
    tokens: {
      superAdmin: await tokenOf(app, { kind: "admin", ...superAdmin }),
      ptA: await tokenOf(app, { kind: "admin", ...ptA }),
      ptB: await tokenOf(app, { kind: "admin", ...ptB }),
      mine: await tokenOf(app, { kind: "user", ...mine }),
      theirs: await tokenOf(app, { kind: "user", ...theirs }),
    },
  };
};

export const destroyWorld = async (world: World) => {
  await world.app.close();
  await world.db.drop();
};

export const http = (app: INestApplication) => ({
  get: (path: string, token?: string) => {
    const call = request(app.getHttpServer()).get(path);

    return token ? call.set(bearer(token)) : call;
  },
  put: (path: string, token?: string, body: object = {}) => {
    const call = request(app.getHttpServer()).put(path).send(body);

    return token ? call.set(bearer(token)) : call;
  },
  post: (path: string, token?: string, body: object = {}) => {
    const call = request(app.getHttpServer()).post(path).send(body);

    return token ? call.set(bearer(token)) : call;
  },
  delete: (path: string, token?: string) => {
    const call = request(app.getHttpServer()).delete(path);

    return token ? call.set(bearer(token)) : call;
  },
});

// Finds the day of that date or creates it, so a test can add several
// exercises to one day.
export const seedDay = async (
  ds: DataSource,
  userId: number,
  date: string,
  fields: { title?: string; note?: string } = {},
) => {
  const repository = ds.getRepository(WorkoutDay);
  const existing = await repository.findOneBy({ userId, date });

  if (existing) {
    return existing.id;
  }
  return (
    await repository.save({
      userId,
      date,
      title: fields.title ?? "",
      note: fields.note ?? "",
    })
  ).id;
};

export const seedExercise = async (
  ds: DataSource,
  dayId: number,
  fields: Partial<
    Pick<
      Exercise,
      "title" | "description" | "sets" | "reps" | "youtubeId" | "position"
    >
  > = {},
) =>
  (
    await ds.getRepository(Exercise).save({
      dayId,
      title: fields.title ?? "Squat",
      description: fields.description ?? "",
      sets: fields.sets ?? null,
      reps: fields.reps ?? "",
      youtubeId: fields.youtubeId ?? LINK_A,
      position: fields.position ?? 0,
    })
  ).id;

// A day with one exercise; returns both ids.
export const seedWorkout = async (
  ds: DataSource,
  userId: number,
  date: string,
  exercise: Parameters<typeof seedExercise>[2] = {},
) => {
  const dayId = await seedDay(ds, userId, date);

  return { dayId, exerciseId: await seedExercise(ds, dayId, exercise) };
};

export const seedSets = (
  ds: DataSource,
  exerciseId: number,
  userId: number,
  sets: { weightKg: number | null; reps: number }[],
) =>
  ds.getRepository(ExerciseSet).save(
    sets.map((set, position) => ({
      exerciseId,
      userId,
      position,
      weightKg: set.weightKg,
      reps: set.reps,
    })),
  );

export const seedCompletion = (
  ds: DataSource,
  exerciseId: number,
  userId: number,
  completedAt = new Date("2026-11-10T12:00:00Z"),
) =>
  ds.getRepository(ExerciseCompletion).save({ exerciseId, userId, completedAt });

// A snapshot of a trainee's plan without ids, for exact comparisons.
export const planOf = async (ds: DataSource, userId: number) => {
  const days = await ds.getRepository(WorkoutDay).find({
    where: { userId },
    order: { date: "ASC" },
  });
  const plan: {
    date: string;
    title: string;
    note: string;
    exercises: {
      title: string;
      description: string;
      sets: number | null;
      reps: string;
      youtubeId: string;
      position: number;
    }[];
  }[] = [];

  for (const day of days) {
    const exercises = await ds.getRepository(Exercise).find({
      where: { dayId: day.id },
      order: { position: "ASC", id: "ASC" },
    });

    plan.push({
      date: day.date,
      title: day.title,
      note: day.note,
      exercises: exercises.map((exercise) => ({
        title: exercise.title,
        description: exercise.description,
        sets: exercise.sets,
        reps: exercise.reps,
        youtubeId: exercise.youtubeId,
        position: exercise.position,
      })),
    });
  }
  return plan;
};

export const countRows = async (
  ds: DataSource,
  entity: typeof Exercise | typeof ExerciseSet | typeof ExerciseCompletion,
  where: object = {},
) => ds.getRepository(entity).count({ where });

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
