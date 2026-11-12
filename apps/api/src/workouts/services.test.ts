import { describe, expect, it, vi } from "vitest";

import type { AdminActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import type { Clock } from "../common/clock.js";
import { DashboardService } from "./dashboard.service.js";
import type { InsightsQueries } from "./insights.queries.js";
import type { ScheduleQueries } from "./schedule.queries.js";
import { TraineeWorkoutsService } from "./trainee-workouts.service.js";
import { WorkoutsPolicy } from "./workouts.policy.js";

// 10:00 UTC on Thursday 2026-11-12 = 17:00 in Ho Chi Minh.
const clock = { now: () => new Date("2026-11-12T10:00:00Z") } as Clock;

describe("TraineeWorkoutsService", () => {
  const exercise = {
    id: 5,
    dayId: 1,
    date: "2026-11-12",
    youtubeId: "dQw4w9WgXcQ",
  };

  const build = (overrides: Partial<Record<keyof ScheduleQueries, unknown>>) => {
    const em = {
      query: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(async () => []),
      insert: vi.fn(),
    };
    const queries = {
      findOwnedExercise: vi.fn(async () => exercise),
      lockExercise: vi.fn(async () => ({
        id: exercise.id,
        youtubeId: exercise.youtubeId,
      })),
      storedSets: vi.fn(async () => []),
      findEarlierSessions: vi.fn(async () => []),
      ...overrides,
    } as unknown as ScheduleQueries;
    const dataSource = {
      manager: em,
      transaction: vi.fn(async (work: (manager: typeof em) => unknown) =>
        work(em),
      ),
    };
    const logger = { error: vi.fn() };
    const service = new TraineeWorkoutsService(
      dataSource as never,
      queries,
      new WorkoutsPolicy(new PtScopePolicy()),
      clock,
      logger as never,
    );

    return { service, em, queries, logger, dataSource };
  };

  it("reports the first schema message and touches nothing for a bad row", async () => {
    const { service, dataSource, queries } = build({});

    await expect(
      service.saveSets(1, 5, [{ weightKg: 0, reps: 10 }]),
    ).rejects.toMatchObject({
      response: { code: "INVALID_SETS", message: "Mức tạ từ 0,5 đến 500 kg" },
    });
    expect(queries.findOwnedExercise).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("answers not found when the exercise is not the trainee's", async () => {
    const { service } = build({ findOwnedExercise: vi.fn(async () => null) });

    await expect(service.saveSets(1, 5, [])).rejects.toMatchObject({
      response: { code: "EXERCISE_NOT_FOUND" },
    });
  });

  it("refuses a future day before opening a transaction", async () => {
    const { service, dataSource } = build({
      findOwnedExercise: vi.fn(async () => ({ ...exercise, date: "2026-11-13" })),
    });

    await expect(service.saveSets(1, 5, [])).rejects.toMatchObject({
      response: { code: "COMPLETION_TOO_EARLY" },
    });
    await expect(service.setCompletion(1, 5, true)).rejects.toMatchObject({
      response: { code: "COMPLETION_TOO_EARLY" },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("answers not found when the row vanished or its link changed under the lock", async () => {
    for (const locked of [null, { id: 5, youtubeId: "newLink00001" }]) {
      const { service, em } = build({ lockExercise: vi.fn(async () => locked) });

      await expect(
        service.saveSets(1, 5, [{ weightKg: 40, reps: 10 }]),
      ).rejects.toMatchObject({ response: { code: "EXERCISE_NOT_FOUND" } });
      expect(em.query).not.toHaveBeenCalled();
      expect(em.insert).not.toHaveBeenCalled();
    }
  });

  it("does not rewrite sets that did not change (KAN-40)", async () => {
    const { service, em } = build({
      storedSets: vi.fn(async () => [{ weightKg: 40, reps: 10 }]),
    });

    await service.saveSets(1, 5, [{ weightKg: 40, reps: 10 }]);

    const statements = em.query.mock.calls.map((call) => String(call[0]));

    expect(statements.some((sql) => sql.includes("DELETE FROM exercise_sets"))).toBe(false);
    expect(em.insert).not.toHaveBeenCalled();
    expect(statements.some((sql) => sql.includes("INSERT INTO exercise_completions"))).toBe(true);
  });

  it("keeps a stored save when the personal-best read fails", async () => {
    const { service, logger } = build({
      findEarlierSessions: vi.fn(async () => {
        throw new Error("history down");
      }),
    });

    await expect(
      service.saveSets(1, 5, [{ weightKg: 40, reps: 10 }]),
    ).resolves.toEqual({ personalBest: false, completedAt: null });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("clears with an empty list without marking the exercise done", async () => {
    const { service, em } = build({
      storedSets: vi.fn(async () => [{ weightKg: 40, reps: 10 }]),
    });

    await service.saveSets(1, 5, []);

    const statements = em.query.mock.calls.map((call) => String(call[0]));

    expect(statements.some((sql) => sql.includes("DELETE FROM exercise_sets"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO exercise_completions"))).toBe(false);
  });
});

describe("DashboardService", () => {
  const admin = (overrides: Partial<AdminActor>): AdminActor =>
    ({ kind: "admin", id: 3, role: "pt", ...overrides }) as AdminActor;

  const build = () => {
    const queries = {
      listMembers: vi.fn(async () => []),
      loadTraineeAliases: vi.fn(async () => new Map()),
      getMemberProgress: vi.fn(async () => []),
    };

    return {
      queries,
      service: new DashboardService(queries as unknown as InsightsQueries, clock),
    };
  };

  it("scopes a PT to their own trainees and ignores the PT filter", async () => {
    const { service, queries } = build();

    await service.summary(admin({ role: "pt" }), undefined, 9);

    expect(queries.listMembers).toHaveBeenCalledWith(
      { adminId: 3, ptOnly: true },
      "all",
    );
  });

  it("passes a super admin's filter through", async () => {
    const { service, queries } = build();

    await service.summary(admin({ role: "super_admin" }), undefined, "none");

    expect(queries.listMembers).toHaveBeenCalledWith(
      { adminId: 3, ptOnly: false },
      "none",
    );
  });

  it("reads the Monday-to-Sunday range of the requested or current week", async () => {
    const { service, queries } = build();
    const members = [{ id: 1 }];

    queries.listMembers.mockResolvedValue(members as never);
    await service.summary(admin({ role: "super_admin" }), "2026-11-15", "all");

    expect(queries.getMemberProgress).toHaveBeenLastCalledWith(
      members,
      "2026-11-09",
      "2026-11-15",
      expect.any(Map),
    );

    await service.summary(admin({ role: "super_admin" }), undefined, "all");
    expect(queries.getMemberProgress).toHaveBeenLastCalledWith(
      members,
      "2026-11-09",
      "2026-11-15",
      expect.any(Map),
    );
  });

  it("returns the totals of the visible members", async () => {
    const { service, queries } = build();

    queries.getMemberProgress.mockResolvedValue([
      { id: 1, assigned: 4, completed: 2 },
      { id: 2, assigned: 0, completed: 0 },
    ] as never);

    const result = await service.summary(admin({ role: "pt" }), undefined, "all");

    expect(result.summary).toEqual({
      memberCount: 2,
      plannedCount: 1,
      activeCount: 1,
      assigned: 4,
      completed: 2,
      percent: 50,
    });
  });
});
