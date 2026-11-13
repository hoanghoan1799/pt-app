import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Exercise } from "../src/database/entities/exercise.entity.js";
import { ExerciseCompletion } from "../src/database/entities/exercise-completion.entity.js";
import { ExerciseSet } from "../src/database/entities/exercise-set.entity.js";
import { WorkoutDay } from "../src/database/entities/workout-day.entity.js";
import { hideTrainee, seedUser } from "./support/auth.js";
import {
  countRows,
  createWorld,
  destroyWorld,
  http,
  LINK_A,
  LINK_B,
  planOf,
  seedCompletion,
  seedDay,
  seedExercise,
  seedSets,
  seedWorkout,
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

const days = (userId: number) => `/v1/trainees/${userId}/workout-days`;
const exercises = (userId: number, id: number) =>
  `/v1/trainees/${userId}/exercises/${id}`;

const positionsOf = async (dayId: number) =>
  (
    await w.ds.getRepository(Exercise).find({
      where: { dayId },
      order: { position: "ASC", id: "ASC" },
    })
  ).map((exercise) => [exercise.title, exercise.position]);

// Role and scope matrix shared by the PT routes.
const guarded = (
  call: (userId: number, token?: string) => Promise<{ status: number; body: { code?: string } }>,
) => {
  it("answers 401 without a session", async () => {
    expect((await call(w.ids.mine)).status).toBe(401);
  });

  it("answers 403 to a trainee", async () => {
    expect((await call(w.ids.mine, w.tokens.mine)).status).toBe(403);
  });

  it("answers 404 for a trainee outside the PT's workspace, 404 for a missing one", async () => {
    const outside = await call(w.ids.theirs, w.tokens.ptA);

    expect(outside.status).toBe(404);
    expect(outside.body.code).toBe("TRAINEE_NOT_FOUND");
    expect((await call(999_999, w.tokens.ptA)).status).toBe(404);
  });
};

describe("GET /v1/trainees/:userId/workout-days", () => {
  const path = (userId: number) =>
    `${days(userId)}?from=2026-11-16&to=2026-11-22`;

  it("shows the trainee's week with logged sets to their PT and to a super admin", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-16", {
      title: "Bench",
      youtubeId: "benchLink001",
    });

    await seedSets(w.ds, exerciseId, w.ids.mine, [{ weightKg: 80, reps: 5 }]);

    for (const token of [w.tokens.ptA, w.tokens.superAdmin]) {
      const response = await api.get(path(w.ids.mine), token);

      expect(response.status).toBe(200);
      expect(response.body.days).toHaveLength(7);
      expect(response.body.days[0].exercises).toEqual([
        {
          id: exerciseId,
          title: "Bench",
          description: "",
          sets: null,
          reps: "",
          youtubeId: "benchLink001",
          position: 0,
          completedAt: null,
          timed: false,
          loggedSets: [{ weightKg: 80, reps: 5 }],
          previousSets: [],
          isPersonalBest: false,
        },
      ]);
    }
  });

  it("validates the range", async () => {
    const response = await api.get(
      `${days(w.ids.mine)}?from=nope&to=2026-11-22`,
      w.tokens.ptA,
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_FAILED");
  });

  it("treats a trainee the PT hid like a missing one", async () => {
    const hidden = (await seedUser(w.ds, { ptAdminId: w.ids.ptA })).id;

    await hideTrainee(w.ds, w.ids.ptA, hidden);

    expect((await api.get(path(hidden), w.tokens.ptA)).status).toBe(404);
    // Another admin who did not hide them still sees them.
    expect((await api.get(path(hidden), w.tokens.superAdmin)).status).toBe(200);
  });

  guarded((userId, token) => api.get(path(userId), token));
});

describe("PUT /v1/trainees/:userId/workout-days/:date", () => {
  it("creates the day, then updates title and note and keeps the exercises", async () => {
    const date = "2026-11-17";
    const created = await api.put(`${days(w.ids.mine)}/${date}`, w.tokens.ptA, {
      title: "  Push day ",
      note: "Warm up first",
    });

    expect(created.status).toBe(200);
    expect(created.body).toEqual({
      date,
      title: "Push day",
      note: "Warm up first",
    });

    const dayId = (await w.ds.getRepository(WorkoutDay).findOneByOrFail({
      userId: w.ids.mine,
      date,
    })).id;

    await seedExercise(w.ds, dayId, { title: "Press" });

    const updated = await api.put(`${days(w.ids.mine)}/${date}`, w.tokens.ptA, {
      title: "Pull day",
    });

    expect(updated.body).toEqual({ date, title: "Pull day", note: "" });
    expect(await planOf(w.ds, w.ids.mine)).toContainEqual({
      date,
      title: "Pull day",
      note: "",
      exercises: [
        {
          title: "Press",
          description: "",
          sets: null,
          reps: "",
          youtubeId: LINK_A,
          position: 0,
        },
      ],
    });
    expect(await w.ds.getRepository(WorkoutDay).countBy({ userId: w.ids.mine, date })).toBe(1);
  });

  it.each([
    [{ title: "x".repeat(121) }, "title: Tối đa 120 ký tự"],
    [{ note: "x".repeat(1001) }, "note: Tối đa 1000 ký tự"],
  ])("refuses %j", async (body, message) => {
    const response = await api.put(
      `${days(w.ids.mine)}/2026-11-18`,
      w.tokens.ptA,
      body,
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
  });

  it("refuses a date that is not a calendar date", async () => {
    const response = await api.put(
      `${days(w.ids.mine)}/2026-02-30`,
      w.tokens.ptA,
      { title: "x" },
    );

    expect(response.status).toBe(400);
  });

  guarded((userId, token) =>
    api.put(`${days(userId)}/2026-11-19`, token, { title: "x" }),
  );
});

describe("POST /v1/trainees/:userId/workout-days/:date/exercises", () => {
  const create = (body: object, date = "2026-11-23", userId = w.ids.mine) =>
    api.post(`${days(userId)}/${date}/exercises`, w.tokens.ptA, body);

  it("adds an exercise, creating the day, and normalises the link and text", async () => {
    const response = await create({
      title: "  Squat ",
      youtubeUrl: `https://youtu.be/${LINK_A}?t=30`,
      sets: 4,
      reps: " 10-12 ",
      description: " Keep the back straight ",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      title: "Squat",
      description: "Keep the back straight",
      sets: 4,
      reps: "10-12",
      youtubeId: LINK_A,
      position: 0,
      completedAt: null,
      timed: false,
    });
    expect(
      (await planOf(w.ds, w.ids.mine)).find((day) => day.date === "2026-11-23"),
    ).toEqual({
      date: "2026-11-23",
      title: "",
      note: "",
      exercises: [
        {
          title: "Squat",
          description: "Keep the back straight",
          sets: 4,
          reps: "10-12",
          youtubeId: LINK_A,
          position: 0,
        },
      ],
    });
  });

  it("appends after the last position and flags timed reps", async () => {
    const date = "2026-11-24";

    await create({ title: "A", youtubeUrl: LINK_A }, date);

    const second = await create(
      { title: "B", youtubeUrl: LINK_B, reps: "30s" },
      date,
    );

    expect(second.body.position).toBe(1);
    expect(second.body.timed).toBe(true);
    expect(second.body.sets).toBeNull();
  });

  it("gives parallel creates distinct positions", async () => {
    const date = "2026-11-25";
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        create({ title: `E${index}`, youtubeUrl: LINK_A }, date),
      ),
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(
      responses.map((response) => response.body.position).sort(),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(await w.ds.getRepository(WorkoutDay).countBy({ userId: w.ids.mine, date })).toBe(1);
  });

  it.each([
    [{ title: "", youtubeUrl: LINK_A }, "title: Nhập tên bài tập"],
    [{ title: "x".repeat(121), youtubeUrl: LINK_A }, "title: Tối đa 120 ký tự"],
    [{ title: "A", youtubeUrl: "" }, "youtubeUrl: Dán link video YouTube"],
    [
      { title: "A", youtubeUrl: "https://example.com/watch?v=dQw4w9WgXcQ" },
      "youtubeUrl: Link YouTube không hợp lệ",
    ],
    [{ title: "A", youtubeUrl: LINK_A, sets: 0 }, "sets: Ít nhất 1 hiệp"],
    [{ title: "A", youtubeUrl: LINK_A, sets: 51 }, "sets: Tối đa 50 hiệp"],
    [
      { title: "A", youtubeUrl: LINK_A, sets: 2.5 },
      "sets: Số hiệp phải là số nguyên",
    ],
    [
      { title: "A", youtubeUrl: LINK_A, reps: "x".repeat(41) },
      "reps: Tối đa 40 ký tự",
    ],
    [
      { title: "A", youtubeUrl: LINK_A, description: "x".repeat(2001) },
      "description: Tối đa 2000 ký tự",
    ],
  ])("refuses %j", async (body, message) => {
    const response = await create(body, "2026-11-26");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_FAILED");
    expect(response.body.message).toBe(message);
  });

  guarded((userId, token) =>
    api.post(`${days(userId)}/2026-11-27/exercises`, token, {
      title: "A",
      youtubeUrl: LINK_A,
    }),
  );
});

describe("PUT /v1/trainees/:userId/exercises/:exerciseId", () => {
  const body = (extra: object = {}) => ({
    title: "Deadlift",
    youtubeUrl: LINK_A,
    sets: 3,
    reps: "5",
    description: "",
    ...extra,
  });

  it("updates the fields and keeps the position and completion", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-11-30", {
      title: "Old",
      position: 2,
    });

    await seedCompletion(w.ds, exerciseId, w.ids.mine);

    const response = await api.put(
      exercises(w.ids.mine, exerciseId),
      w.tokens.ptA,
      body({ reps: "45s" }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: exerciseId,
      title: "Deadlift",
      description: "",
      sets: 3,
      reps: "45s",
      youtubeId: LINK_A,
      position: 2,
      completedAt: null,
      timed: true,
    });
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(1);
  });

  it("changes the link freely when nothing is logged", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-12-01");
    const response = await api.put(
      exercises(w.ids.mine, exerciseId),
      w.tokens.ptA,
      body({ youtubeUrl: `https://www.youtube.com/watch?v=${LINK_B}` }),
    );

    expect(response.status).toBe(200);
    expect(response.body.youtubeId).toBe(LINK_B);
  });

  it("asks for confirmation before a new link deletes logged sets (KAN-39)", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-12-02");

    await seedSets(w.ds, exerciseId, w.ids.mine, [{ weightKg: 60, reps: 8 }]);
    await seedCompletion(w.ds, exerciseId, w.ids.mine);

    const refused = await api.put(
      exercises(w.ids.mine, exerciseId),
      w.tokens.ptA,
      body({ youtubeUrl: LINK_B }),
    );

    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("LINK_CHANGE_NEEDS_CONFIRM");
    expect(refused.body.message).toBe(
      "Đổi link video cần xác nhận xóa số liệu đã ghi",
    );
    expect(
      (await w.ds.getRepository(Exercise).findOneByOrFail({ id: exerciseId })).youtubeId,
    ).toBe(LINK_A);
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(1);

    // confirmResetSets must be the boolean true, not a truthy string.
    const stringy = await api.put(
      exercises(w.ids.mine, exerciseId),
      w.tokens.ptA,
      body({ youtubeUrl: LINK_B, confirmResetSets: "true" }),
    );

    expect(stringy.status).toBe(400);

    const confirmed = await api.put(
      exercises(w.ids.mine, exerciseId),
      w.tokens.ptA,
      body({ youtubeUrl: LINK_B, confirmResetSets: true }),
    );

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.youtubeId).toBe(LINK_B);
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(0);
    // The completion is kept.
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(1);
  });

  it("does not ask when another URL form points at the same video", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-12-03");

    await seedSets(w.ds, exerciseId, w.ids.mine, [{ weightKg: 60, reps: 8 }]);

    const response = await api.put(
      exercises(w.ids.mine, exerciseId),
      w.tokens.ptA,
      body({ youtubeUrl: `https://youtu.be/${LINK_A}?t=5`, title: "Renamed" }),
    );

    expect(response.status).toBe(200);
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(1);
  });

  it("answers 404 EXERCISE_NOT_FOUND for a deleted exercise or one of another trainee (KAN-39)", async () => {
    const other = await seedWorkout(w.ds, w.ids.other, "2026-12-04");

    for (const id of [other.exerciseId, 999_999]) {
      const response = await api.put(
        exercises(w.ids.mine, id),
        w.tokens.ptA,
        body(),
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("EXERCISE_NOT_FOUND");
      expect(response.body.message).toBe("Bài tập không còn tồn tại");
    }
    expect(
      (await w.ds.getRepository(Exercise).findOneByOrFail({ id: other.exerciseId })).title,
    ).toBe("Squat");
  });

  guarded((userId, token) =>
    api.put(exercises(userId, 1), token, body()),
  );
});

describe("DELETE /v1/trainees/:userId/exercises/:exerciseId", () => {
  it("deletes an exercise without logged data", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-12-07");
    const response = await api.delete(
      exercises(w.ids.mine, exerciseId),
      w.tokens.ptA,
    );

    expect(response.status).toBe(204);
    expect(await countRows(w.ds, Exercise, { id: exerciseId })).toBe(0);
  });

  it("refuses to wipe logged sets without confirmation, then deletes with it (KAN-51)", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-12-08");

    await seedSets(w.ds, exerciseId, w.ids.mine, [{ weightKg: 50, reps: 10 }]);
    await seedCompletion(w.ds, exerciseId, w.ids.mine);

    for (const query of ["", "?confirmDeleteSets=false"]) {
      const refused = await api.delete(
        `${exercises(w.ids.mine, exerciseId)}${query}`,
        w.tokens.ptA,
      );

      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("EXERCISE_HAS_SETS");
      expect(refused.body.message).toBe(
        "Học viên đã ghi số liệu cho bài này. Xóa bài tập sẽ xóa luôn số liệu. Tiếp tục?",
      );
    }
    expect(await countRows(w.ds, Exercise, { id: exerciseId })).toBe(1);
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(1);

    const confirmed = await api.delete(
      `${exercises(w.ids.mine, exerciseId)}?confirmDeleteSets=true`,
      w.tokens.ptA,
    );

    expect(confirmed.status).toBe(204);
    expect(await countRows(w.ds, Exercise, { id: exerciseId })).toBe(0);
    expect(await countRows(w.ds, ExerciseSet, { exerciseId })).toBe(0);
    expect(await countRows(w.ds, ExerciseCompletion, { exerciseId })).toBe(0);
  });

  it("succeeds for an exercise that is already gone and leaves another trainee's alone", async () => {
    const other = await seedWorkout(w.ds, w.ids.other, "2026-12-09");

    expect(
      (await api.delete(exercises(w.ids.mine, 999_999), w.tokens.ptA)).status,
    ).toBe(204);
    expect(
      (await api.delete(exercises(w.ids.mine, other.exerciseId), w.tokens.ptA)).status,
    ).toBe(204);
    expect(await countRows(w.ds, Exercise, { id: other.exerciseId })).toBe(1);
  });

  it("rejects a malformed confirmation flag", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-12-10");
    const response = await api.delete(
      `${exercises(w.ids.mine, exerciseId)}?confirmDeleteSets=maybe`,
      w.tokens.ptA,
    );

    expect(response.status).toBe(400);
    expect(await countRows(w.ds, Exercise, { id: exerciseId })).toBe(1);
  });

  guarded((userId, token) => api.delete(exercises(userId, 1), token));
});

describe("POST /v1/trainees/:userId/exercises/:exerciseId/move", () => {
  const move = (id: number, direction: string, userId = w.ids.mine) =>
    api.post(`${exercises(userId, id)}/move`, w.tokens.ptA, { direction });

  it("swaps with the neighbour, renumbering repairs gaps, edges are no-ops", async () => {
    const dayId = await seedDay(w.ds, w.ids.mine, "2026-12-14");
    const a = await seedExercise(w.ds, dayId, { title: "A", position: 0 });
    const b = await seedExercise(w.ds, dayId, { title: "B", position: 3 });
    const c = await seedExercise(w.ds, dayId, { title: "C", position: 5 });

    // Order is by position: A, B, C (positions 0, 3, 5).
    expect((await move(b, "down")).status).toBe(204);
    expect(await positionsOf(dayId)).toEqual([
      ["A", 0],
      ["C", 1],
      ["B", 2],
    ]);

    expect((await move(c, "up")).status).toBe(204);
    expect(await positionsOf(dayId)).toEqual([
      ["C", 0],
      ["A", 1],
      ["B", 2],
    ]);

    // Edges change nothing.
    await move(c, "up");
    await move(b, "down");
    expect(await positionsOf(dayId)).toEqual([
      ["C", 0],
      ["A", 1],
      ["B", 2],
    ]);
    expect(a).toBeGreaterThan(0);
  });

  it("ignores a missing exercise and another trainee's one", async () => {
    const other = await seedWorkout(w.ds, w.ids.other, "2026-12-15");
    const second = await seedExercise(w.ds, other.dayId, {
      title: "Second",
      position: 1,
    });

    expect((await move(second, "up")).status).toBe(204);
    expect((await move(999_999, "up")).status).toBe(204);
    expect(await positionsOf(other.dayId)).toEqual([
      ["Squat", 0],
      ["Second", 1],
    ]);
  });

  it("refuses an unknown direction", async () => {
    const { exerciseId } = await seedWorkout(w.ds, w.ids.mine, "2026-12-16");

    expect((await move(exerciseId, "sideways")).status).toBe(400);
  });

  guarded((userId, token) =>
    api.post(`${exercises(userId, 1)}/move`, token, { direction: "up" }),
  );
});

describe("POST /v1/trainees/:userId/workout-days/copy-week", () => {
  const SOURCE = "2027-01-04"; // Monday
  const TARGET = "2027-01-11"; // next Monday
  const copyWeek = (body: object, token = w.tokens.ptA, userId = w.ids.mine) =>
    api.post(`${days(userId)}/copy-week`, token, body);

  const plan = (rows: { date: string; title: string }[]) =>
    rows.map(({ date, title }) => ({ date, title }));

  const seedSourceWeek = async (userId: number) => {
    const monday = await seedDay(w.ds, userId, SOURCE, {
      title: "Legs",
      note: "Heavy",
    });
    const squat = await seedExercise(w.ds, monday, {
      title: "Squat",
      description: "Deep",
      sets: 4,
      reps: "8",
      youtubeId: LINK_A,
      position: 0,
    });

    await seedExercise(w.ds, monday, {
      title: "Plank",
      reps: "45s",
      youtubeId: LINK_B,
      position: 1,
    });
    // Tuesday carries only a note, which still counts as content.
    await seedDay(w.ds, userId, "2027-01-05", { note: "Rest" });
    // An empty day is not copied.
    await seedDay(w.ds, userId, "2027-01-06");
    // Logged data stays with the source.
    await seedSets(w.ds, squat, userId, [{ weightKg: 100, reps: 5 }]);
    await seedCompletion(w.ds, squat, userId);
  };

  it("copies the week's content to another week of the same trainee, rows exact", async () => {
    await seedSourceWeek(w.ids.mine);

    const response = await copyWeek({ fromWeek: "2027-01-06", targetUserId: w.ids.mine, targetDate: "2027-01-14" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      copiedDays: 2,
      targetUserId: w.ids.mine,
      targetWeekStart: TARGET,
    });

    const copied = (await planOf(w.ds, w.ids.mine)).filter(
      (day) => day.date >= TARGET && day.date < "2027-01-18",
    );

    expect(copied).toEqual([
      {
        date: "2027-01-11",
        title: "Legs",
        note: "Heavy",
        exercises: [
          {
            title: "Squat",
            description: "Deep",
            sets: 4,
            reps: "8",
            youtubeId: LINK_A,
            position: 0,
          },
          {
            title: "Plank",
            description: "",
            sets: null,
            reps: "45s",
            youtubeId: LINK_B,
            position: 1,
          },
        ],
      },
      { date: "2027-01-12", title: "", note: "Rest", exercises: [] },
    ]);
    // Sets and completions stay on the source exercise only.
    expect(await countRows(w.ds, ExerciseSet, { userId: w.ids.mine })).toBeGreaterThan(0);
    const copiedIds = (
      await w.ds
        .getRepository(Exercise)
        .createQueryBuilder("e")
        .innerJoin(WorkoutDay, "d", "d.id = e.day_id")
        .where("d.user_id = :user AND d.date >= :from", {
          user: w.ids.mine,
          from: TARGET,
        })
        .getMany()
    ).map((exercise) => exercise.id);

    for (const id of copiedIds) {
      expect(await countRows(w.ds, ExerciseSet, { exerciseId: id })).toBe(0);
      expect(await countRows(w.ds, ExerciseCompletion, { exerciseId: id })).toBe(0);
    }
    // The source week is untouched.
    expect(
      plan(
        (await planOf(w.ds, w.ids.mine)).filter(
          (day) => day.date >= SOURCE && day.date < TARGET,
        ),
      ),
    ).toEqual([
      { date: "2027-01-04", title: "Legs" },
      { date: "2027-01-05", title: "" },
      { date: "2027-01-06", title: "" },
    ]);
  });

  it("replaces the target week as a whole when it has no logged sets", async () => {
    // Left over from the previous test: the target week holds the copy. A
    // stray day is added to prove the week is replaced, not merged.
    await seedDay(w.ds, w.ids.mine, "2027-01-13", { title: "Stray" });

    const response = await copyWeek({
      fromWeek: SOURCE,
      targetUserId: w.ids.mine,
      targetDate: TARGET,
    });

    expect(response.status).toBe(200);
    expect(
      (await planOf(w.ds, w.ids.mine))
        .filter((day) => day.date >= TARGET && day.date < "2027-01-18")
        .map((day) => day.date),
    ).toEqual(["2027-01-11", "2027-01-12"]);
  });

  it("refuses to overwrite a week with logged sets and changes nothing", async () => {
    const before = await planOf(w.ds, w.ids.mine);
    const target = await w.ds.getRepository(WorkoutDay).findOneByOrFail({
      userId: w.ids.mine,
      date: "2027-01-11",
    });
    const exercise = await w.ds.getRepository(Exercise).findOneByOrFail({
      dayId: target.id,
      position: 0,
    });

    await seedSets(w.ds, exercise.id, w.ids.mine, [{ weightKg: 90, reps: 5 }]);

    const response = await copyWeek({
      fromWeek: SOURCE,
      targetUserId: w.ids.mine,
      targetDate: TARGET,
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("COPY_TARGET_HAS_SETS");
    expect(response.body.message).toBe(
      "Tuần đích đã có buổi tập được ghi, không thể ghi đè",
    );
    expect(await planOf(w.ds, w.ids.mine)).toEqual(before);
    expect(await countRows(w.ds, ExerciseSet, { exerciseId: exercise.id })).toBe(1);
  });

  it("copies to another trainee in the PT's workspace, and a super admin may copy anywhere", async () => {
    const response = await copyWeek({
      fromWeek: SOURCE,
      targetUserId: w.ids.other,
      targetDate: TARGET,
    });

    expect(response.status).toBe(200);
    expect(response.body.targetUserId).toBe(w.ids.other);
    expect(
      (await planOf(w.ds, w.ids.other))
        .filter((day) => day.date >= TARGET)
        .map((day) => day.date),
    ).toEqual(["2027-01-11", "2027-01-12"]);

    const byAdmin = await copyWeek(
      { fromWeek: SOURCE, targetUserId: w.ids.theirs, targetDate: TARGET },
      w.tokens.superAdmin,
    );

    expect(byAdmin.status).toBe(200);
    expect(
      (await planOf(w.ds, w.ids.theirs)).filter((day) => day.date >= TARGET),
    ).toHaveLength(2);
  });

  it("answers the same 404 for a target outside the workspace, a hidden one and a missing one", async () => {
    const before = await planOf(w.ds, w.ids.theirs);

    for (const targetUserId of [w.ids.theirs, 999_999]) {
      const response = await copyWeek({
        fromWeek: SOURCE,
        targetUserId,
        targetDate: "2027-02-01",
      });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("TRAINEE_NOT_FOUND");
    }
    expect(await planOf(w.ds, w.ids.theirs)).toEqual(before);
    const hiddenId = (await seedUser(w.ds, { ptAdminId: w.ids.ptA })).id;

    await hideTrainee(w.ds, w.ids.ptA, hiddenId);

    const hidden = await copyWeek({
      fromWeek: SOURCE,
      targetUserId: hiddenId,
      targetDate: "2027-02-01",
    });

    expect(hidden.status).toBe(404);
  });

  it("refuses the very same week and an empty source week", async () => {
    const same = await copyWeek({
      fromWeek: "2027-01-05",
      targetUserId: w.ids.mine,
      targetDate: "2027-01-10",
    });

    expect(same.status).toBe(400);
    expect(same.body.code).toBe("COPY_SAME_WEEK");
    expect(same.body.message).toBe("Hãy chọn một tuần khác hoặc user khác");

    const empty = await copyWeek({
      fromWeek: "2027-03-01",
      targetUserId: w.ids.mine,
      targetDate: "2027-03-08",
    });

    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe("COPY_EMPTY");
    expect(empty.body.message).toBe("Tuần này chưa có nội dung để sao chép");
  });

  it("validates the body", async () => {
    for (const body of [
      {},
      { fromWeek: "bad", targetUserId: w.ids.mine, targetDate: TARGET },
      { fromWeek: SOURCE, targetUserId: 0, targetDate: TARGET },
      { fromWeek: SOURCE, targetUserId: w.ids.mine },
    ]) {
      expect((await copyWeek(body)).status).toBe(400);
    }
  });

  guarded((userId, token) =>
    api.post(`${days(userId)}/copy-week`, token, {
      fromWeek: SOURCE,
      targetUserId: userId,
      targetDate: "2027-05-03",
    }),
  );
});

describe("POST /v1/trainees/:userId/workout-days/copy-day", () => {
  // Today is Thursday 2026-11-12 on the fake clock.
  const copyDay = (body: object, token = w.tokens.superAdmin, userId = w.ids.theirs) =>
    api.post(`${days(userId)}/copy-day`, token, body);

  const seedSource = async () => {
    const dayId = await seedDay(w.ds, w.ids.theirs, "2026-12-21", {
      title: "Upper",
      note: "Easy",
    });

    await seedExercise(w.ds, dayId, {
      title: "Row",
      sets: 3,
      reps: "12",
      youtubeId: LINK_A,
      position: 0,
    });
    await seedExercise(w.ds, dayId, {
      title: "Curl",
      youtubeId: LINK_B,
      position: 1,
    });
  };

  it("copies the day to the chosen dates in order, dropping duplicates and the source", async () => {
    await seedSource();

    const response = await copyDay({
      date: "2026-12-21",
      dates: ["2026-12-23", "2026-12-21", "2026-12-22", "2026-12-23"],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ copied: 2 });

    const exercisesOf = [
      {
        title: "Row",
        description: "",
        sets: 3,
        reps: "12",
        youtubeId: LINK_A,
        position: 0,
      },
      {
        title: "Curl",
        description: "",
        sets: null,
        reps: "",
        youtubeId: LINK_B,
        position: 1,
      },
    ];

    expect(
      (await planOf(w.ds, w.ids.theirs)).filter(
        (day) => day.date >= "2026-12-21" && day.date <= "2026-12-23",
      ),
    ).toEqual(
      ["2026-12-21", "2026-12-22", "2026-12-23"].map((date) => ({
        date,
        title: "Upper",
        note: "Easy",
        exercises: exercisesOf,
      })),
    );
  });

  it("replaces a target day that has a workout", async () => {
    const dayId = await seedDay(w.ds, w.ids.theirs, "2026-12-24", {
      title: "Old",
    });

    await seedExercise(w.ds, dayId, { title: "Old move" });

    const response = await copyDay({
      date: "2026-12-21",
      dates: ["2026-12-24"],
    });

    expect(response.status).toBe(200);

    const day = (await planOf(w.ds, w.ids.theirs)).find(
      (item) => item.date === "2026-12-24",
    );

    expect(day?.title).toBe("Upper");
    expect(day?.exercises.map((exercise) => exercise.title)).toEqual([
      "Row",
      "Curl",
    ]);
  });

  it("refuses the whole request when one target has logged sets", async () => {
    const target = await w.ds.getRepository(WorkoutDay).findOneByOrFail({
      userId: w.ids.theirs,
      date: "2026-12-22",
    });
    const exercise = await w.ds.getRepository(Exercise).findOneByOrFail({
      dayId: target.id,
      position: 0,
    });

    await seedSets(w.ds, exercise.id, w.ids.theirs, [{ weightKg: 40, reps: 10 }]);

    const before = await planOf(w.ds, w.ids.theirs);
    const response = await copyDay({
      date: "2026-12-21",
      dates: ["2026-12-25", "2026-12-22"],
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("COPY_DAY_TARGET_HAS_SETS");
    expect(response.body.message).toBe(
      "Có ngày đích đã được ghi buổi tập, không thể ghi đè",
    );
    // Nothing written, not even the clean target.
    expect(await planOf(w.ds, w.ids.theirs)).toEqual(before);
  });

  it("rejects a past date wholesale, accepts today", async () => {
    const before = await planOf(w.ds, w.ids.theirs);
    const past = await copyDay({
      date: "2026-12-21",
      dates: ["2026-12-26", "2026-11-11"],
    });

    expect(past.status).toBe(400);
    expect(past.body.code).toBe("PAST_TARGET_DAYS");
    expect(past.body.message).toBe("Không thể sao chép sang ngày đã qua");
    expect(await planOf(w.ds, w.ids.theirs)).toEqual(before);

    const today = await copyDay({ date: "2026-12-21", dates: ["2026-11-12"] });

    expect(today.status).toBe(200);
  });

  it("refuses when only the source date is chosen or the source is empty", async () => {
    const none = await copyDay({ date: "2026-12-21", dates: ["2026-12-21"] });

    expect(none.status).toBe(400);
    expect(none.body.code).toBe("NO_TARGET_DAYS");
    expect(none.body.message).toBe("Chọn ít nhất một ngày");

    const empty = await copyDay({ date: "2026-12-30", dates: ["2026-12-31"] });

    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe("COPY_DAY_EMPTY");
    expect(empty.body.message).toBe("Ngày này chưa có bài tập để sao chép");
  });

  it("validates the body: no dates, too many dates, a bad date", async () => {
    const dates = Array.from({ length: 15 }, (_, index) => `2027-02-${String(index + 1).padStart(2, "0")}`);

    for (const body of [
      { date: "2026-12-21", dates: [] },
      { date: "2026-12-21", dates },
      { date: "2026-12-21", dates: ["2027-02-30"] },
      { dates: ["2027-02-03"] },
    ]) {
      expect((await copyDay(body)).status).toBe(400);
    }
  });

  guarded((userId, token) =>
    api.post(`${days(userId)}/copy-day`, token, {
      date: "2026-12-21",
      dates: ["2026-12-27"],
    }),
  );
});

describe("GET /v1/trainees/:userId/workout-days/copy-info", () => {
  it("lists the days with a plan and the days locked by logged sets", async () => {
    const a = await seedDay(w.ds, w.ids.theirs, "2027-04-01", { title: "A" });
    const b = await seedDay(w.ds, w.ids.theirs, "2027-04-02");
    const exercise = await seedExercise(w.ds, b);

    await seedExercise(w.ds, a);
    await seedDay(w.ds, w.ids.theirs, "2027-04-03");
    await seedDay(w.ds, w.ids.theirs, "2027-04-04", { note: "Only a note" });
    await seedSets(w.ds, exercise, w.ids.theirs, [{ weightKg: 20, reps: 10 }]);

    const response = await api.get(
      `${days(w.ids.theirs)}/copy-info?from=2027-04-01&to=2027-04-30`,
      w.tokens.superAdmin,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      planDates: ["2027-04-01", "2027-04-02", "2027-04-04"],
      logDates: ["2027-04-02"],
    });
  });

  it("rejects a range wider than six weeks or reversed", async () => {
    for (const query of [
      "from=2027-04-01&to=2027-06-30",
      "from=2027-04-10&to=2027-04-01",
    ]) {
      expect(
        (await api.get(`${days(w.ids.theirs)}/copy-info?${query}`, w.tokens.superAdmin)).status,
      ).toBe(400);
    }
  });

  guarded((userId, token) =>
    api.get(`${days(userId)}/copy-info?from=2027-04-01&to=2027-04-30`, token),
  );
});
