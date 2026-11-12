import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { User } from "../src/database/entities/user.entity.js";
import { hideTrainee, seedUser, tokenOf } from "./support/auth.js";
import {
  createWorld,
  destroyWorld,
  http,
  seedCompletion,
  seedDay,
  seedExercise,
  seedSets,
  type World,
} from "./support/workouts.js";

let w: World;
let api: ReturnType<typeof http>;
const ids = {} as { binh: number; an: number; cuc: number; dung: number };
const exerciseIds = {} as Record<string, number>;

const rename = (id: number, name: string) =>
  w.ds.getRepository(User).update(id, { name, nameKey: name.toLowerCase() });

const stampSets = (exerciseId: number, at: string) =>
  w.ds.query(`UPDATE exercise_sets SET created_at = $2 WHERE exercise_id = $1`, [
    exerciseId,
    at,
  ]);

// One exercise on a day of a trainee, with optional sets and completion.
const seed = async (
  key: string,
  userId: number,
  date: string,
  options: {
    title?: string;
    youtubeId?: string;
    sets?: { weightKg: number | null; reps: number }[];
    setsAt?: string;
    completedAt?: string;
  } = {},
) => {
  const dayId = await seedDay(w.ds, userId, date);
  const exerciseId = await seedExercise(w.ds, dayId, {
    title: options.title ?? "Squat",
    youtubeId: options.youtubeId ?? "squatLink01",
  });

  exerciseIds[key] = exerciseId;
  if (options.sets) {
    await seedSets(w.ds, exerciseId, userId, options.sets);
    await stampSets(exerciseId, options.setsAt ?? "2026-11-09T09:00:00Z");
  }
  if (options.completedAt) {
    await seedCompletion(w.ds, exerciseId, userId, new Date(options.completedAt));
  }
};

beforeAll(async () => {
  w = await createWorld();
  api = http(w.app);
  // Binh = mine and An = other (PT A), Cuc = theirs (PT B), Dung has no PT.
  ids.binh = w.ids.mine;
  ids.an = w.ids.other;
  ids.cuc = w.ids.theirs;
  ids.dung = (await seedUser(w.ds, { ptAdminId: null })).id;
  await rename(ids.binh, "Binh");
  await rename(ids.an, "An");
  await rename(ids.cuc, "Cuc");
  await rename(ids.dung, "Dung");

  // Binh: an earlier session, then this week's record, a second exercise not
  // done, and something after the week.
  await seed("binhOld", ids.binh, "2026-11-02", {
    sets: [{ weightKg: 50, reps: 5 }],
    setsAt: "2026-11-02T09:00:00Z",
    completedAt: "2026-11-02T10:00:00Z",
  });
  await seed("binhSquat", ids.binh, "2026-11-09", {
    sets: [{ weightKg: 60, reps: 5 }],
    setsAt: "2026-11-10T13:00:00Z",
    completedAt: "2026-11-10T12:00:00Z",
  });
  await seed("binhRow", ids.binh, "2026-11-10", {
    title: "Row",
    youtubeId: "rowLink00001",
  });
  // A session after the week never counts for the week's progress.
  await seed("binhLater", ids.binh, "2026-11-20", {
    sets: [{ weightKg: 100, reps: 5 }],
    setsAt: "2026-11-20T09:00:00Z",
  });
  await seed("binhDown", ids.binh, "2026-11-03", {
    title: "Press",
    youtubeId: "downLink0001",
    sets: [{ weightKg: 80, reps: 5 }],
    setsAt: "2026-11-03T09:00:00Z",
  });
  await seed("binhDownNow", ids.binh, "2026-11-11", {
    title: "Press",
    youtubeId: "downLink0001",
    sets: [{ weightKg: 70, reps: 5 }],
    setsAt: "2026-11-11T09:00:00Z",
  });
  await seed("binhFirst", ids.binh, "2026-11-12", {
    title: "Curl",
    youtubeId: "firstLink001",
    sets: [{ weightKg: 40, reps: 10 }],
    setsAt: "2026-11-12T09:00:00Z",
  });
  await seed("anRow", ids.an, "2026-11-09", { title: "Row" });
  await seed("cuc1", ids.cuc, "2026-11-09", {
    title: "Lunge",
    youtubeId: "lungeLink001",
    completedAt: "2026-11-11T08:00:00Z",
  });
  await seed("cuc2", ids.cuc, "2026-11-10", {
    title: "Dip",
    youtubeId: "dipLink00001",
    completedAt: "2026-11-11T09:00:00Z",
  });
  // Food logged on two different days for Binh.
  for (const date of ["2026-11-09", "2026-11-09", "2026-11-11"]) {
    await w.ds.query(
      `INSERT INTO food_entries (user_id, date, meal) VALUES ($1, $2, 'lunch')`,
      [ids.binh, date],
    );
  }
});

afterAll(async () => {
  await destroyWorld(w);
});

const names = (body: { members: { name: string }[] }) =>
  body.members.map((member) => member.name);

describe("GET /v1/dashboard/summary", () => {
  it("lists every trainee for a super admin, week snapped to Monday, with exact numbers", async () => {
    const response = await api.get(
      "/v1/dashboard/summary?week=2026-11-12",
      w.tokens.superAdmin,
    );

    expect(response.status).toBe(200);
    expect(response.body.weekStart).toBe("2026-11-09");
    expect(names(response.body)).toEqual(["An", "Binh", "Cuc", "Dung"]);

    const [an, binh, cuc, dung] = response.body.members;

    expect(an).toEqual({
      id: ids.an,
      name: "An",
      displayName: "An",
      avatarUpdatedAt: null,
      ptAdminId: w.ids.ptA,
      ptName: expect.any(String),
      assigned: 1,
      completed: 0,
      plannedDays: 1,
      activeDays: 0,
      nutritionDays: 0,
      lastActiveAt: null,
      percent: 0,
      status: "not-started",
    });
    // Binh: 5 exercises this week (Mon squat, Tue row, Wed press, Thu curl),
    // 1 done; food on two different days.
    expect(binh).toMatchObject({
      assigned: 4,
      plannedDays: 4,
      completed: 1,
      activeDays: 1,
      nutritionDays: 2,
      lastActiveAt: "2026-11-10T12:00:00.000Z",
      percent: 25,
      status: "in-progress",
    });
    expect(cuc).toMatchObject({
      ptAdminId: w.ids.ptB,
      assigned: 2,
      completed: 2,
      activeDays: 2,
      lastActiveAt: "2026-11-11T09:00:00.000Z",
      percent: 100,
      status: "done",
    });
    expect(dung).toMatchObject({
      ptAdminId: null,
      ptName: null,
      assigned: 0,
      percent: 0,
      status: "no-plan",
    });
    expect(response.body.summary).toEqual({
      memberCount: 4,
      plannedCount: 3,
      activeCount: 2,
      assigned: 7,
      completed: 3,
      percent: 43,
    });
  });

  it("defaults to the current week", async () => {
    const response = await api.get("/v1/dashboard/summary", w.tokens.superAdmin);

    expect(response.body.weekStart).toBe("2026-11-09");
  });

  it("scopes a PT to their own trainees and ignores the PT filter", async () => {
    for (const query of ["", "?pt=none", `?pt=${w.ids.ptB}`]) {
      const response = await api.get(
        `/v1/dashboard/summary${query}`,
        w.tokens.ptA,
      );

      expect(response.status).toBe(200);
      expect(names(response.body), query).toEqual(["An", "Binh"]);
      expect(response.body.summary.memberCount).toBe(2);
      expect(response.body.summary.assigned).toBe(5);
    }
  });

  it("lets a super admin filter by PT, by none, and falls back to all on garbage", async () => {
    const get = async (query: string) =>
      names(
        (await api.get(`/v1/dashboard/summary?pt=${query}`, w.tokens.superAdmin))
          .body,
      );

    expect(await get(String(w.ids.ptB))).toEqual(["Cuc"]);
    expect(await get("none")).toEqual(["Dung"]);
    expect(await get("abc")).toEqual(["An", "Binh", "Cuc", "Dung"]);
    expect(await get("-3")).toEqual(["An", "Binh", "Cuc", "Dung"]);
  });

  it("shows the admin's own nickname and the avatar version", async () => {
    await w.ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, $2, 'Bé Bình', now()), ($3, $2, 'Not mine', now())`,
      [`admin:${w.ids.ptA}`, `user:${ids.binh}`, `admin:${w.ids.ptB}`],
    );
    await w.ds.query(`UPDATE users SET avatar_updated_at = $2 WHERE id = $1`, [
      ids.binh,
      "2023-11-14T22:13:20Z",
    ]);

    const asPt = await api.get("/v1/dashboard/summary", w.tokens.ptA);
    const asSuper = await api.get("/v1/dashboard/summary", w.tokens.superAdmin);

    expect(
      asPt.body.members.map((m: { name: string; displayName: string }) => [
        m.name,
        m.displayName,
      ]),
    ).toEqual([
      ["An", "An"],
      ["Binh", "Bé Bình"],
    ]);
    expect(asSuper.body.members[1].displayName).toBe("Binh");
    expect(asPt.body.members[1].avatarUpdatedAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("leaves a trainee the admin hid out of the list and the totals, for that admin only", async () => {
    await hideTrainee(w.ds, w.ids.ptA, ids.binh);

    const asPt = await api.get("/v1/dashboard/summary", w.tokens.ptA);
    const asSuper = await api.get("/v1/dashboard/summary", w.tokens.superAdmin);

    expect(names(asPt.body)).toEqual(["An"]);
    expect(asPt.body.summary).toMatchObject({ memberCount: 1, assigned: 1 });
    expect(names(asSuper.body)).toEqual(["An", "Binh", "Cuc", "Dung"]);

    await w.ds.query(`DELETE FROM admin_hidden_users`);
  });

  it("validates the week and refuses trainees and anonymous callers", async () => {
    expect(
      (await api.get("/v1/dashboard/summary?week=nope", w.tokens.ptA)).status,
    ).toBe(400);
    expect((await api.get("/v1/dashboard/summary")).status).toBe(401);
    expect(
      (await api.get("/v1/dashboard/summary", w.tokens.mine)).status,
    ).toBe(403);
  });
});

describe("GET /v1/dashboard/activity", () => {
  it("merges completions and personal bests, newest first", async () => {
    const response = await api.get(
      "/v1/dashboard/activity?limit=50",
      w.tokens.superAdmin,
    );

    expect(response.status).toBe(200);

    const items = response.body.items as {
      kind: string;
      id: number;
      userName: string;
      occurredAt: string;
    }[];

    expect(
      items.map((item) => [item.kind, item.userName, item.occurredAt]),
    ).toEqual([
      ["personalBest", "Binh", "2026-11-20T09:00:00.000Z"],
      ["completion", "Cuc", "2026-11-11T09:00:00.000Z"],
      ["completion", "Cuc", "2026-11-11T08:00:00.000Z"],
      ["personalBest", "Binh", "2026-11-10T13:00:00.000Z"],
      ["completion", "Binh", "2026-11-10T12:00:00.000Z"],
      ["completion", "Binh", "2026-11-02T10:00:00.000Z"],
    ]);
    expect(items[3]).toEqual({
      kind: "personalBest",
      id: exerciseIds.binhSquat,
      userId: ids.binh,
      userName: "Binh",
      displayName: "Binh",
      exerciseTitle: "Squat",
      date: "2026-11-09",
      occurredAt: "2026-11-10T13:00:00.000Z",
      best: { weightKg: 60, reps: 5 },
      previousBest: { weightKg: 50, reps: 5 },
    });
    expect(items[1]).toMatchObject({
      kind: "completion",
      id: expect.any(Number),
      userId: ids.cuc,
      exerciseTitle: "Dip",
      date: "2026-11-10",
    });
  });

  it("applies the limit and validates it", async () => {
    const one = await api.get(
      "/v1/dashboard/activity?limit=1",
      w.tokens.superAdmin,
    );

    expect(one.body.items).toHaveLength(1);

    for (const limit of ["0", "51", "x"]) {
      expect(
        (await api.get(`/v1/dashboard/activity?limit=${limit}`, w.tokens.superAdmin))
          .status,
      ).toBe(400);
    }
    expect(
      (await api.get("/v1/dashboard/activity", w.tokens.superAdmin)).body.items,
    ).toHaveLength(6);
  });

  it("shows a PT only their trainees, with their nicknames, and nothing of hidden ones", async () => {
    const names_ = async () =>
      (await api.get("/v1/dashboard/activity", w.tokens.ptA)).body.items.map(
        (item: { userName: string; displayName: string; kind: string }) => [
          item.kind,
          item.userName,
          item.displayName,
        ],
      );

    expect(await names_()).toEqual([
      ["personalBest", "Binh", "Bé Bình"],
      ["personalBest", "Binh", "Bé Bình"],
      ["completion", "Binh", "Bé Bình"],
      ["completion", "Binh", "Bé Bình"],
    ]);

    await hideTrainee(w.ds, w.ids.ptA, ids.binh);
    expect(await names_()).toEqual([]);
    expect(
      (await api.get("/v1/dashboard/activity", w.tokens.superAdmin)).body.items,
    ).toHaveLength(6);
    await w.ds.query(`DELETE FROM admin_hidden_users`);
  });

  it("refuses trainees and anonymous callers", async () => {
    expect((await api.get("/v1/dashboard/activity")).status).toBe(401);
    expect((await api.get("/v1/dashboard/activity", w.tokens.mine)).status).toBe(
      403,
    );
  });
});

describe("GET /v1/trainees/:userId/activity", () => {
  it("shows one trainee's feed to their PT", async () => {
    const response = await api.get(
      `/v1/trainees/${ids.binh}/activity`,
      w.tokens.ptA,
    );

    expect(response.status).toBe(200);
    expect(
      response.body.items.map((item: { kind: string; userId: number }) => [
        item.kind,
        item.userId,
      ]),
    ).toEqual([
      ["personalBest", ids.binh],
      ["personalBest", ids.binh],
      ["completion", ids.binh],
      ["completion", ids.binh],
    ]);
  });

  it("answers 404 outside the workspace, 403 to trainees, 401 without a session", async () => {
    expect(
      (await api.get(`/v1/trainees/${ids.cuc}/activity`, w.tokens.ptA)).status,
    ).toBe(404);
    expect(
      (await api.get(`/v1/trainees/${ids.binh}/activity`, w.tokens.mine)).status,
    ).toBe(403);
    expect((await api.get(`/v1/trainees/${ids.binh}/activity`)).status).toBe(
      401,
    );
  });
});

describe("GET /v1/trainees/:userId/progress", () => {
  it("compares the week's best with the best before, per exercise link", async () => {
    const response = await api.get(
      `/v1/trainees/${ids.binh}/progress?week=2026-11-12`,
      w.tokens.ptA,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      weekStart: "2026-11-09",
      rows: [
        {
          youtubeId: "firstLink001",
          title: "Curl",
          weekBest: { weightKg: 40, reps: 10 },
          previousBest: null,
          changeKg: null,
          trend: "first",
          lastDate: "2026-11-12",
        },
        {
          youtubeId: "downLink0001",
          title: "Press",
          weekBest: { weightKg: 70, reps: 5 },
          previousBest: { weightKg: 80, reps: 5 },
          changeKg: -10,
          trend: "down",
          lastDate: "2026-11-11",
        },
        {
          youtubeId: "squatLink01",
          title: "Squat",
          weekBest: { weightKg: 60, reps: 5 },
          previousBest: { weightKg: 50, reps: 5 },
          changeKg: 10,
          trend: "up",
          lastDate: "2026-11-09",
        },
      ],
    });
  });

  it("ignores sessions after the week and leaves out links without a weighted set", async () => {
    const later = await api.get(
      `/v1/trainees/${ids.binh}/progress?week=2026-11-23`,
      w.tokens.ptA,
    );

    expect(later.body.rows).toEqual([]);

    const noSets = await api.get(
      `/v1/trainees/${ids.an}/progress?week=2026-11-09`,
      w.tokens.ptA,
    );

    expect(noSets.body).toEqual({ weekStart: "2026-11-09", rows: [] });
  });

  it("defaults to the current week and validates the week", async () => {
    expect(
      (await api.get(`/v1/trainees/${ids.binh}/progress`, w.tokens.ptA)).body
        .weekStart,
    ).toBe("2026-11-09");
    expect(
      (await api.get(`/v1/trainees/${ids.binh}/progress?week=x`, w.tokens.ptA))
        .status,
    ).toBe(400);
  });

  it("answers 404 outside the workspace and for a hidden trainee, 403 and 401 otherwise", async () => {
    expect(
      (await api.get(`/v1/trainees/${ids.cuc}/progress`, w.tokens.ptA)).status,
    ).toBe(404);
    expect(
      (await api.get(`/v1/trainees/${ids.cuc}/progress`, w.tokens.superAdmin))
        .status,
    ).toBe(200);

    await hideTrainee(w.ds, w.ids.ptA, ids.an);
    expect(
      (await api.get(`/v1/trainees/${ids.an}/progress`, w.tokens.ptA)).status,
    ).toBe(404);
    await w.ds.query(`DELETE FROM admin_hidden_users`);

    expect(
      (await api.get(`/v1/trainees/${ids.binh}/progress`, w.tokens.mine)).status,
    ).toBe(403);
    expect((await api.get(`/v1/trainees/${ids.binh}/progress`)).status).toBe(401);
  });
});

describe("copy racing a trainee's save", () => {
  it("either the copy wins and the save finds no exercise, or the save wins and the copy is refused", async () => {
    for (let round = 0; round < 4; round += 1) {
      const trainee = await seedUser(w.ds, { ptAdminId: w.ids.ptA });
      const token = await tokenOf(w.app, { kind: "user", ...trainee });
      // The target week holds one exercise; the source week holds content.
      const targetWeek = `2026-10-${String(5 + round * 7).padStart(2, "0")}`;
      const sourceWeek = "2026-09-07";
      const sourceDay = await seedDay(w.ds, trainee.id, sourceWeek, {
        title: "Src",
      });

      await seedExercise(w.ds, sourceDay, { title: "From source" });
      await seed(`race${round}`, trainee.id, targetWeek, { title: "Target" });

      const [save, copy] = await Promise.all([
        api.put(
          `/v1/me/exercises/${exerciseIds[`race${round}`]}/sets`,
          token,
          { sets: [{ weightKg: 40, reps: 10 }] },
        ),
        api.post(
          `/v1/trainees/${trainee.id}/workout-days/copy-week`,
          w.tokens.ptA,
          {
            fromWeek: sourceWeek,
            targetUserId: trainee.id,
            targetDate: targetWeek,
          },
        ),
      ]);
      const setRows = await w.ds.query(
        "SELECT 1 FROM exercise_sets WHERE user_id = $1",
        [trainee.id],
      );

      if (copy.status === 200) {
        // Copy first: the exercise was replaced, so the save found nothing.
        expect(save.status, `round ${round}`).toBe(404);
        expect(setRows).toHaveLength(0);
      } else {
        // Save first: the logged set is history and blocks the overwrite.
        expect(save.status, `round ${round}`).toBe(200);
        expect(copy.status, `round ${round}`).toBe(409);
        expect(copy.body.code).toBe("COPY_TARGET_HAS_SETS");
        expect(setRows).toHaveLength(1);
      }
    }
  });
});
