import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Exercise } from "../src/database/entities/exercise.entity.js";
import { ExerciseCompletion } from "../src/database/entities/exercise-completion.entity.js";
import { ExerciseSet } from "../src/database/entities/exercise-set.entity.js";
import {
  countRows,
  createWorld,
  destroyWorld,
  http,
  LINK_A,
  LINK_B,
  seedCompletion,
  seedSets,
  seedWorkout,
  sleep,
  TODAY,
  type World,
} from "./support/workouts.js";

let w: World;
let api: ReturnType<typeof http>;

beforeAll(async () => {
  w = await createWorld();
  api = http(w.app);
});

afterAll(async () => {
  await destroyWorld(w);
});

const FUTURE = "2026-11-13";

const setsOf = (exerciseId: number) =>
  w.ds.getRepository(ExerciseSet).find({
    where: { exerciseId },
    order: { position: "ASC" },
  });

describe("GET /v1/me/workout-days", () => {
  it("returns one entry per date with exercises, sets, hints and the record flag", async () => {
    const earlier = await seedWorkout(w.ds, w.ids.mine, "2026-11-02", {
      title: "Squat",
    });

    await seedSets(w.ds, earlier.exerciseId, w.ids.mine, [
      { weightKg: 50, reps: 5 },
    ]);

    const monday = await seedWorkout(w.ds, w.ids.mine, "2026-11-09", {
      title: "Squat",
      sets: 3,
      reps: "10",
    });

    await seedSets(w.ds, monday.exerciseId, w.ids.mine, [
      { weightKg: 60, reps: 5 },
      { weightKg: null, reps: 12 },
    ]);
    await seedCompletion(w.ds, monday.exerciseId, w.ids.mine);

    const tuesday = await seedWorkout(w.ds, w.ids.mine, "2026-11-10", {
      title: "Plank",
      reps: "30s",
      youtubeId: LINK_B,
      position: 1,
    });
    // Same day, listed first by position although created later.
    await w.ds.getRepository(Exercise).save({
      dayId: tuesday.dayId,
      title: "Warm-up",
      youtubeId: LINK_B,
      position: 0,
    });
    // Another trainee's plan must never show.
    await seedWorkout(w.ds, w.ids.theirs, "2026-11-09", { title: "Theirs" });

    const response = await api.get(
      "/v1/me/workout-days?from=2026-11-09&to=2026-11-15",
      w.tokens.mine,
    );

    expect(response.status).toBe(200);
    expect(response.body.days.map((day: { date: string }) => day.date)).toEqual(
      [
        "2026-11-09",
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
        "2026-11-15",
      ],
    );
    expect(response.body.days[0].exercises).toEqual([
      {
        id: monday.exerciseId,
        title: "Squat",
        description: "",
        sets: 3,
        reps: "10",
        youtubeId: LINK_A,
        position: 0,
        completedAt: "2026-11-10T12:00:00.000Z",
        timed: false,
        loggedSets: [
          { weightKg: 60, reps: 5 },
          { weightKg: null, reps: 12 },
        ],
        previousSets: [{ weightKg: 50, reps: 5 }],
        isPersonalBest: true,
      },
    ]);
    expect(
      response.body.days[1].exercises.map(
        (exercise: { title: string; timed: boolean; completedAt: unknown }) => [
          exercise.title,
          exercise.timed,
          exercise.completedAt,
        ],
      ),
    ).toEqual([
      ["Warm-up", false, null],
      ["Plank", true, null],
    ]);
    expect(response.body.days[2]).toEqual({
      date: "2026-11-11",
      title: "",
      note: "",
      exercises: [],
    });
  });

  it("rejects a missing, malformed or too wide range", async () => {
    const paths = [
      "/v1/me/workout-days",
      "/v1/me/workout-days?from=2026-11-09",
      "/v1/me/workout-days?from=2026-13-09&to=2026-11-15",
      "/v1/me/workout-days?from=2026-11-15&to=2026-11-09",
      "/v1/me/workout-days?from=2026-01-01&to=2026-12-31",
    ];

    for (const path of paths) {
      const response = await api.get(path, w.tokens.mine);

      expect(response.status, path).toBe(400);
      expect(response.body.code, path).toBe("VALIDATION_FAILED");
    }
  });

  it("answers 401 without a session and 403 to an admin", async () => {
    const path = "/v1/me/workout-days?from=2026-11-09&to=2026-11-15";

    expect((await api.get(path)).status).toBe(401);
    expect((await api.get(path, w.tokens.ptA)).status).toBe(403);
  });
});

describe("PUT /v1/me/exercises/:id/sets", () => {
  it("replaces the sets, marks the exercise done and flags a record", async () => {
    const earlier = await seedWorkout(w.ds, w.ids.mine, "2026-10-01", {
      youtubeId: "recordLink1",
    });

    await seedSets(w.ds, earlier.exerciseId, w.ids.mine, [
      { weightKg: 50, reps: 5 },
    ]);

    const today = await seedWorkout(w.ds, w.ids.mine, TODAY, {
      youtubeId: "recordLink1",
    });
    const first = await api.put(
      `/v1/me/exercises/${today.exerciseId}/sets`,
      w.tokens.mine,
      {
        sets: [
          { weightKg: 55, reps: 5 },
          { weightKg: null, reps: 10 },
        ],
      },
    );

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      personalBest: true,
      completedAt: "2026-11-12T10:00:00.000Z",
    });
    expect(
      (await setsOf(today.exerciseId)).map((set) => [
        set.position,
        set.userId,
        set.weightKg,
        set.reps,
      ]),
    ).toEqual([
      [0, w.ids.mine, 55, 5],
      [1, w.ids.mine, null, 10],
    ]);

    // Fewer sets replace the old list; a tie with the earlier best is no record.
    const second = await api.put(
      `/v1/me/exercises/${today.exerciseId}/sets`,
      w.tokens.mine,
      { sets: [{ weightKg: 50, reps: 5 }] },
    );

    expect(second.body.personalBest).toBe(false);
    expect(
      (await setsOf(today.exerciseId)).map((set) => [set.weightKg, set.reps]),
    ).toEqual([[50, 5]]);
  });

  it("keeps the stored rows on a no-op re-save (KAN-40)", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-03", {
      youtubeId: "noopLink001",
    });
    const body = {
      sets: [
        { weightKg: 40, reps: 10 },
        { weightKg: 40, reps: 8 },
      ],
    };

    await api.put(`/v1/me/exercises/${exerciseId}/sets`, w.tokens.mine, body);

    const before = await setsOf(exerciseId);
    const again = await api.put(
      `/v1/me/exercises/${exerciseId}/sets`,
      w.tokens.mine,
      body,
    );
    const after = await setsOf(exerciseId);

    expect(again.status).toBe(200);
    expect(after.map((set) => [set.id, set.createdAt.getTime()])).toEqual(
      before.map((set) => [set.id, set.createdAt.getTime()]),
    );
  });

  it("clears the sets with an empty list but keeps the completion (D2)", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-04", {
      youtubeId: "clearLink001",
    });

    await api.put(`/v1/me/exercises/${exerciseId}/sets`, w.tokens.mine, {
      sets: [{ weightKg: 30, reps: 12 }],
    });

    const cleared = await api.put(
      `/v1/me/exercises/${exerciseId}/sets`,
      w.tokens.mine,
      { sets: [] },
    );

    expect(cleared.status).toBe(200);
    expect(cleared.body.personalBest).toBe(false);
    expect(cleared.body.completedAt).toBe("2026-11-12T10:00:00.000Z");
    expect(await setsOf(exerciseId)).toEqual([]);
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(1);
  });

  it("stores nothing and marks nothing done for an empty first save", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-05", {
      youtubeId: "emptyLink001",
    });
    const response = await api.put(
      `/v1/me/exercises/${exerciseId}/sets`,
      w.tokens.mine,
      { sets: [] },
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ personalBest: false, completedAt: null });
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(0);
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(0);
  });

  it.each([
    [{ weightKg: 0, reps: 10 }, "Mức tạ từ 0,5 đến 500 kg"],
    [{ weightKg: 500.5, reps: 10 }, "Mức tạ từ 0,5 đến 500 kg"],
    [{ weightKg: -5, reps: 10 }, "Mức tạ từ 0,5 đến 500 kg"],
    [{ weightKg: "40", reps: 10 }, "Mức tạ từ 0,5 đến 500 kg"],
    [{ weightKg: 40.25, reps: 10 }, "Mức tạ phải chia hết cho 0,5 kg"],
    [{ weightKg: 40, reps: 0 }, "Số lần từ 1 đến 100"],
    [{ weightKg: 40, reps: 101 }, "Số lần từ 1 đến 100"],
    [{ weightKg: 40, reps: 2.5 }, "Số lần phải là số nguyên"],
    [{ weightKg: 40 }, "Số lần từ 1 đến 100"],
  ])("refuses %j with the web's message", async (row, message) => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-06", {
      youtubeId: "validLink001",
    });
    const response = await api.put(
      `/v1/me/exercises/${exerciseId}/sets`,
      w.tokens.mine,
      { sets: [row] },
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_SETS");
    expect(response.body.message).toBe(message);
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(0);
  });

  it("accepts ten rows and refuses eleven", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-07", {
      youtubeId: "manyLink0001",
    });
    const rows = (count: number) =>
      Array.from({ length: count }, () => ({ weightKg: 20, reps: 10 }));

    expect(
      (
        await api.put(`/v1/me/exercises/${exerciseId}/sets`, w.tokens.mine, {
          sets: rows(10),
        })
      ).status,
    ).toBe(200);

    const tooMany = await api.put(
      `/v1/me/exercises/${exerciseId}/sets`,
      w.tokens.mine,
      { sets: rows(11) },
    );

    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toBe("Tối đa 10 hiệp");
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(10);
  });

  it("refuses a body without a sets array and a bad id", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-08");

    expect(
      (
        await api.put(`/v1/me/exercises/${exerciseId}/sets`, w.tokens.mine, {})
      ).status,
    ).toBe(400);
    expect(
      (
        await api.put("/v1/me/exercises/abc/sets", w.tokens.mine, { sets: [] })
      ).status,
    ).toBe(400);
  });

  it("answers 404 for a missing exercise and another trainee's one (KAN-40)", async () => {
    const theirs = await seedWorkout(w.ds, w.ids.theirs, "2026-11-02");
    const body = { sets: [{ weightKg: 40, reps: 10 }] };

    for (const id of [theirs.exerciseId, 999_999]) {
      const response = await api.put(
        `/v1/me/exercises/${id}/sets`,
        w.tokens.mine,
        body,
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("EXERCISE_NOT_FOUND");
      expect(response.body.message).toBe("Bài tập không còn tồn tại");
    }
    expect(
      await countRows(w.ds, ExerciseSet, { exerciseId: theirs.exerciseId }),
    ).toBe(0);
  });

  it("refuses a day that has not come yet", async () => {
    const future = await seedWorkout(w.ds, w.ids.mine, FUTURE);
    const response = await api.put(
      `/v1/me/exercises/${future.exerciseId}/sets`,
      w.tokens.mine,
      { sets: [{ weightKg: 40, reps: 10 }] },
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("COMPLETION_TOO_EARLY");
    expect(response.body.message).toBe("Chưa tới ngày tập bài này");
    expect(await countRows(w.ds, ExerciseSet, { exerciseId: future.exerciseId })).toBe(0);
  });

  it("answers 401 without a session and 403 to an admin", async () => {
    expect(
      (await api.put("/v1/me/exercises/1/sets", undefined, { sets: [] })).status,
    ).toBe(401);
    expect(
      (await api.put("/v1/me/exercises/1/sets", w.tokens.ptA, { sets: [] }))
        .status,
    ).toBe(403);
  });

  it("serialises concurrent identical saves into one history and one completion", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-10-20", {
      youtubeId: "raceLink0001",
    });
    const body = {
      sets: [
        { weightKg: 70, reps: 5 },
        { weightKg: 70, reps: 4 },
      ],
    };
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        api.put(`/v1/me/exercises/${exerciseId}/sets`, w.tokens.mine, body),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array(6).fill(200),
    );
    expect(
      (await setsOf(exerciseId)).map((set) => [set.position, set.weightKg, set.reps]),
    ).toEqual([
      [0, 70, 5],
      [1, 70, 4],
    ]);
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(1);
  });

  it("refuses sets read before a link change that landed while it waited (KAN-39)", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-10-21", {
      youtubeId: "oldLink00001",
    });
    // The PT's link change holds the row lock; the trainee's save reads the
    // exercise, then waits for it.
    const pt = w.ds.createQueryRunner();

    await pt.connect();
    await pt.startTransaction();
    await pt.query(`SELECT id FROM exercises WHERE id = $1 FOR UPDATE`, [
      exerciseId,
    ]);

    const pending = api.put(
      `/v1/me/exercises/${exerciseId}/sets`,
      w.tokens.mine,
      { sets: [{ weightKg: 40, reps: 10 }] },
    );
    const settled = pending.then((response) => response);

    await sleep(400);
    await pt.query(`UPDATE exercises SET youtube_id = $2 WHERE id = $1`, [
      exerciseId,
      "newLink00001",
    ]);
    await pt.commitTransaction();
    await pt.release();

    const response = await settled;

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("EXERCISE_NOT_FOUND");
    expect(await setsOf(exerciseId)).toEqual([]);
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(0);
  });

  it("leaves no rows behind when the PT deleted the exercise meanwhile (KAN-40)", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-10-22", {
      youtubeId: "goneLink0001",
    });
    const pt = w.ds.createQueryRunner();

    await pt.connect();
    await pt.startTransaction();
    await pt.query(`SELECT id FROM exercises WHERE id = $1 FOR UPDATE`, [
      exerciseId,
    ]);

    const settled = api
      .put(`/v1/me/exercises/${exerciseId}/sets`, w.tokens.mine, {
        sets: [{ weightKg: 40, reps: 10 }],
      })
      .then((response) => response);

    await sleep(400);
    await pt.query(`DELETE FROM exercises WHERE id = $1`, [exerciseId]);
    await pt.commitTransaction();
    await pt.release();

    const response = await settled;

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("EXERCISE_NOT_FOUND");
    expect(await w.ds.getRepository(ExerciseSet).count({ where: { exerciseId } })).toBe(0);
    expect(await w.ds.getRepository(ExerciseCompletion).count({ where: { exerciseId } })).toBe(0);
  });
});

describe("PUT /v1/me/exercises/:id/completion", () => {
  it("sets and clears the state idempotently", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-10-23");
    const path = `/v1/me/exercises/${exerciseId}/completion`;

    const done = await api.put(path, w.tokens.mine, { completed: true });

    expect(done.status).toBe(200);
    expect(done.body).toEqual({ completedAt: "2026-11-12T10:00:00.000Z" });

    // A double tap keeps the first completion time.
    w.clock.advance(60_000);

    const again = await api.put(path, w.tokens.mine, { completed: true });

    expect(again.body).toEqual({ completedAt: "2026-11-12T10:00:00.000Z" });
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(1);

    const undone = await api.put(path, w.tokens.mine, { completed: false });

    expect(undone.status).toBe(200);
    expect(undone.body).toEqual({ completedAt: null });
    expect(
      (await api.put(path, w.tokens.mine, { completed: false })).body,
    ).toEqual({ completedAt: null });
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(0);
    w.clock.advance(-60_000);
  });

  it("allows today and refuses a future day", async () => {
    const today = await seedWorkout(w.ds, w.ids.mine, TODAY, {
      youtubeId: "todayLink001",
    });
    const future = await seedWorkout(w.ds, w.ids.mine, FUTURE, {
      youtubeId: "futureLink01",
    });

    expect(
      (
        await api.put(
          `/v1/me/exercises/${today.exerciseId}/completion`,
          w.tokens.mine,
          { completed: true },
        )
      ).status,
    ).toBe(200);

    const early = await api.put(
      `/v1/me/exercises/${future.exerciseId}/completion`,
      w.tokens.mine,
      { completed: true },
    );

    expect(early.status).toBe(409);
    expect(early.body.code).toBe("COMPLETION_TOO_EARLY");
    expect(
      await countRows(w.ds, ExerciseCompletion, { exerciseId: future.exerciseId }),
    ).toBe(0);
  });

  it("answers 404 for a missing or foreign exercise and 400 for a bad body", async () => {
    const theirs = await seedWorkout(w.ds, w.ids.theirs, "2026-10-24");
    const mine = await seedWorkout(w.ds, w.ids.mine, "2026-10-24", {
      youtubeId: "bodyLink0001",
    });

    for (const id of [theirs.exerciseId, 999_999]) {
      const response = await api.put(
        `/v1/me/exercises/${id}/completion`,
        w.tokens.mine,
        { completed: true },
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("EXERCISE_NOT_FOUND");
    }
    expect(
      await countRows(w.ds, ExerciseCompletion, { exerciseId: theirs.exerciseId }),
    ).toBe(0);
    expect(
      (
        await api.put(
          `/v1/me/exercises/${mine.exerciseId}/completion`,
          w.tokens.mine,
          { completed: "yes" },
        )
      ).status,
    ).toBe(400);
  });

  it("answers 401 without a session and 403 to an admin", async () => {
    expect(
      (await api.put("/v1/me/exercises/1/completion", undefined, { completed: true })).status,
    ).toBe(401);
    expect(
      (await api.put("/v1/me/exercises/1/completion", w.tokens.ptA, { completed: true })).status,
    ).toBe(403);
  });

  it("keeps one row under concurrent toggles", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-10-25", {
      youtubeId: "toggleLink01",
    });
    const path = `/v1/me/exercises/${exerciseId}/completion`;
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        api.put(path, w.tokens.mine, { completed: true }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array(10).fill(200),
    );
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(1);

    // Mixed on/off in flight ends in one of the two valid states, no error.
    const mixed = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        api.put(path, w.tokens.mine, { completed: index % 2 === 0 }),
      ),
    );

    expect(mixed.every((response) => response.status === 200)).toBe(true);
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBeLessThanOrEqual(1);
  });

  it("writes no completion for an exercise the PT deleted meanwhile", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-10-26", {
      youtubeId: "delLink00001",
    });
    const pt = w.ds.createQueryRunner();

    await pt.connect();
    await pt.startTransaction();
    await pt.query(`DELETE FROM exercises WHERE id = $1`, [exerciseId]);

    const settled = api
      .put(`/v1/me/exercises/${exerciseId}/completion`, w.tokens.mine, {
        completed: true,
      })
      .then((response) => response);

    await sleep(400);
    await pt.commitTransaction();
    await pt.release();

    const response = await settled;

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("EXERCISE_NOT_FOUND");
    expect(
      await w.ds.getRepository(ExerciseCompletion).count({ where: { exerciseId } }),
    ).toBe(0);
  });
});
