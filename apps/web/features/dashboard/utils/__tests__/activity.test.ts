import { describe, expect, it } from "vitest";

import type { ActivityItem } from "@/features/dashboard/types/dashboard";
import {
  type ActivitySession,
  findPersonalBests,
  mergeActivity,
} from "@/features/dashboard/utils/activity";
import type { LoggedSet, SetSession } from "@/features/workouts/utils/sets";

const SQUAT = "squatLink01";

const createSession = (
  exerciseId: number,
  date: string,
  sets: LoggedSet[],
  overrides: Partial<ActivitySession> = {},
): ActivitySession => ({
  userId: 1,
  userName: "An",
  exerciseTitle: "Squat",
  youtubeId: SQUAT,
  date,
  exerciseId,
  sets,
  occurredAt: 1_000,
  ...overrides,
});

const EARLIER: SetSession = createSession(1, "2026-10-12", [
  { weightKg: 40, reps: 10 },
]);

describe("findPersonalBests", () => {
  it("returns a record when the session beats the earlier best", () => {
    const today = createSession(2, "2026-10-20", [{ weightKg: 42.5, reps: 8 }]);

    expect(findPersonalBests([today], [EARLIER, today])).toEqual([
      {
        kind: "personalBest",
        id: 2,
        userId: 1,
        userName: "An",
        exerciseTitle: "Squat",
        date: "2026-10-20",
        occurredAt: 1_000,
        best: { weightKg: 42.5, reps: 8 },
        previousBest: { weightKg: 40, reps: 10 },
      },
    ]);
  });

  it("returns nothing for a tie or a lighter session (D6)", () => {
    const tie = createSession(2, "2026-10-20", [{ weightKg: 40, reps: 10 }]);
    const lighter = createSession(3, "2026-10-21", [
      { weightKg: 35, reps: 12 },
    ]);

    expect(findPersonalBests([tie, lighter], [EARLIER, tie, lighter])).toEqual(
      [],
    );
  });

  it("returns nothing for a first-ever or bodyweight-only session (D11, OQ2)", () => {
    const first = createSession(2, "2026-10-20", [{ weightKg: 40, reps: 10 }]);
    const bodyweight = createSession(3, "2026-10-21", [
      { weightKg: null, reps: 30 },
    ]);

    expect(findPersonalBests([first], [first])).toEqual([]);
    expect(findPersonalBests([bodyweight], [EARLIER, bodyweight])).toEqual([]);
  });

  it("ignores history of other users, other links and the same day", () => {
    const today = createSession(5, "2026-10-20", [{ weightKg: 30, reps: 5 }]);
    const history = [
      createSession(2, "2026-10-12", [{ weightKg: 20, reps: 5 }]),
      createSession(3, "2026-10-12", [{ weightKg: 100, reps: 5 }], {
        userId: 2,
      }),
      createSession(4, "2026-10-12", [{ weightKg: 100, reps: 5 }], {
        youtubeId: "otherLink01",
      }),
      createSession(6, "2026-10-20", [{ weightKg: 100, reps: 5 }]),
      today,
    ];

    expect(findPersonalBests([today], history)).toMatchObject([
      { id: 5, previousBest: { weightKg: 20, reps: 5 } },
    ]);
  });
});

const completion = (id: number, occurredAt: number): ActivityItem => ({
  kind: "completion",
  id,
  userId: 1,
  userName: "An",
  exerciseTitle: "Squat",
  date: "2026-10-20",
  occurredAt,
});

const record = (id: number, occurredAt: number): ActivityItem => ({
  ...completion(id, occurredAt),
  kind: "personalBest",
  best: { weightKg: 42.5, reps: 8 },
  previousBest: { weightKg: 40, reps: 10 },
});

const keyOf = (item: ActivityItem) => `${item.kind}-${item.id}`;

describe("mergeActivity", () => {
  it("sorts newest first and keeps at most `limit` items", () => {
    const merged = mergeActivity(
      [completion(1, 3_000), completion(2, 1_000)],
      [record(7, 2_000), record(8, 500)],
      3,
    );

    expect(merged.map(keyOf)).toEqual([
      "completion-1",
      "personalBest-7",
      "completion-2",
    ]);
  });

  it("puts the record first on the same timestamp and keeps keys unique", () => {
    const merged = mergeActivity(
      [completion(7, 2_000)],
      [record(7, 2_000)],
      10,
    );
    const keys = merged.map(keyOf);

    expect(keys).toEqual(["personalBest-7", "completion-7"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns an empty list when there is nothing", () => {
    expect(mergeActivity([], [], 10)).toEqual([]);
  });
});
