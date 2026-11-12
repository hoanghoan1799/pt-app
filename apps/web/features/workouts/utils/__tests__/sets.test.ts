import { describe, expect, it } from "vitest";

import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import {
  areSetsEqual,
  exerciseSetsSchema,
  getBestSet,
  getPreviousSession,
  isPersonalBest,
  type LoggedSet,
  type SessionKey,
  type SetSession,
} from "@/features/workouts/utils/sets";

const LINK = "dQw4w9WgXcQ";
const OTHER_LINK = "9bZkp7q19f0";

const set = (weightKg: number | null, reps: number): LoggedSet => ({
  weightKg,
  reps,
});

const session = (
  date: string,
  sets: LoggedSet[],
  overrides: Partial<SetSession> = {},
): SetSession => ({
  userId: 1,
  youtubeId: LINK,
  date,
  exerciseId: 1,
  sets,
  ...overrides,
});

const key = (date: string): SessionKey => ({
  userId: 1,
  youtubeId: LINK,
  date,
});

describe("getBestSet", () => {
  // A13
  it("returns the heaviest set", () => {
    expect(getBestSet([set(40, 10), set(45, 5), set(42.5, 8)])).toEqual(
      set(45, 5),
    );
  });

  it("breaks a weight tie with more reps", () => {
    expect(getBestSet([set(40, 8), set(40, 10), set(40, 9)])).toEqual(
      set(40, 10),
    );
  });

  it("returns the first set on an exact tie", () => {
    const first = set(40, 10);
    const second = set(40, 10);

    expect(getBestSet([first, second])).toBe(first);
  });

  // A14
  it("ignores bodyweight sets", () => {
    expect(getBestSet([set(null, 30), set(20, 5), set(null, 50)])).toEqual(
      set(20, 5),
    );
  });

  it.each([
    ["all bodyweight", [set(null, 10), set(null, 12)]],
    ["empty", []],
  ])("returns null when %s", (_, sets) => {
    expect(getBestSet(sets)).toBeNull();
  });
});

describe("isPersonalBest", () => {
  const history = [session("2026-10-01", [set(40, 10), set(37.5, 12)])];

  // A15
  it.each([
    ["heavier", [set(42.5, 5)]],
    ["same weight, more reps", [set(40, 11)]],
  ])("is true when %s than the earlier best", (_, sets) => {
    expect(isPersonalBest(sets, history, key("2026-10-08"))).toBe(true);
  });

  // A16
  it.each([
    ["a tie", [set(40, 10)]],
    ["lighter", [set(37.5, 12)]],
    ["same weight, fewer reps", [set(40, 9)]],
  ])("is false on %s", (_, sets) => {
    expect(isPersonalBest(sets, history, key("2026-10-08"))).toBe(false);
  });

  it("compares with the best over all earlier sessions", () => {
    const sessions = [
      session("2026-09-24", [set(50, 3)]),
      session("2026-10-01", [set(40, 10)]),
    ];

    expect(isPersonalBest([set(45, 5)], sessions, key("2026-10-08"))).toBe(
      false,
    );
  });

  // A17
  it.each([
    ["there is no history", []],
    [
      "earlier sessions are bodyweight only",
      [session("2026-10-01", [set(null, 20)])],
    ],
    [
      "weighted sets exist only on the same day or later",
      [
        session("2026-10-08", [set(20, 5)], { exerciseId: 2 }),
        session("2026-10-15", [set(10, 5)]),
      ],
    ],
  ])("is false when %s (first weighted set)", (_, sessions) => {
    expect(isPersonalBest([set(40, 10)], sessions, key("2026-10-08"))).toBe(
      false,
    );
  });

  it("ignores later sessions when a past day is edited", () => {
    const sessions = [
      session("2026-10-01", [set(40, 10)]),
      session("2026-10-15", [set(60, 10)]),
    ];

    expect(isPersonalBest([set(42.5, 8)], sessions, key("2026-10-08"))).toBe(
      true,
    );
  });

  it("ignores other users and other links", () => {
    const sessions = [
      session("2026-10-01", [set(40, 10)]),
      session("2026-10-02", [set(80, 10)], { userId: 2 }),
      session("2026-10-03", [set(80, 10)], { youtubeId: OTHER_LINK }),
    ];

    expect(isPersonalBest([set(42.5, 8)], sessions, key("2026-10-08"))).toBe(
      true,
    );
  });

  // A18
  it("is false for bodyweight-only new sets", () => {
    expect(isPersonalBest([set(null, 50)], history, key("2026-10-08"))).toBe(
      false,
    );
  });
});

describe("getPreviousSession", () => {
  // A19
  it("returns the latest session strictly before the date", () => {
    const latest = session("2026-10-01", [set(40, 10)]);
    const sessions = [
      session("2026-09-17", [set(35, 10)]),
      latest,
      session("2026-09-24", [set(37.5, 10)]),
    ];

    expect(getPreviousSession(sessions, key("2026-10-08"))).toBe(latest);
  });

  it("picks the later day when the link appears twice in one earlier week", () => {
    const friday = session("2026-10-03", [set(42.5, 8)], { exerciseId: 5 });
    const sessions = [
      session("2026-09-29", [set(40, 10)], { exerciseId: 3 }),
      friday,
    ];

    expect(getPreviousSession(sessions, key("2026-10-06"))).toBe(friday);
  });

  it("picks the lowest exerciseId when the link appears twice on the previous date", () => {
    const first = session("2026-10-01", [set(40, 10)], { exerciseId: 7 });
    const sessions = [
      session("2026-10-01", [set(45, 5)], { exerciseId: 9 }),
      first,
    ];

    expect(getPreviousSession(sessions, key("2026-10-08"))).toBe(first);
  });

  it("skips sessions without sets", () => {
    const logged = session("2026-09-24", [set(40, 10)]);
    const sessions = [logged, session("2026-10-01", [])];

    expect(getPreviousSession(sessions, key("2026-10-08"))).toBe(logged);
  });

  // A20
  it.each([
    [
      "earlier the same day",
      session("2026-10-08", [set(40, 10)], { exerciseId: 2 }),
    ],
    ["a later date", session("2026-10-15", [set(40, 10)])],
    ["another user", session("2026-10-01", [set(40, 10)], { userId: 2 })],
    [
      "another link",
      session("2026-10-01", [set(40, 10)], { youtubeId: OTHER_LINK }),
    ],
  ])("never returns a session from %s", (_, excluded) => {
    expect(getPreviousSession([excluded], key("2026-10-08"))).toBeNull();
  });

  it("returns null without history", () => {
    expect(getPreviousSession([], key("2026-10-08"))).toBeNull();
  });
});

const firstMessage = (input: unknown) => {
  const result = exerciseSetsSchema.safeParse(input);

  return result.success ? null : result.error.issues[0]?.message;
};

describe("exerciseSetsSchema", () => {
  // A4
  it.each([null, 0.5, 40, 42.5, 500])("accepts weight %s", (weightKg) => {
    expect(exerciseSetsSchema.safeParse([{ weightKg, reps: 10 }]).success).toBe(
      true,
    );
  });

  it.each([
    [40.25, WORKOUT_MESSAGES.SET_WEIGHT_STEP],
    [0, WORKOUT_MESSAGES.SET_WEIGHT_RANGE],
    [500.5, WORKOUT_MESSAGES.SET_WEIGHT_RANGE],
    [-5, WORKOUT_MESSAGES.SET_WEIGHT_RANGE],
  ])("rejects weight %s with a message", (weightKg, message) => {
    expect(firstMessage([{ weightKg, reps: 10 }])).toBe(message);
  });

  // A5
  it.each([1, 100])("accepts reps %s", (reps) => {
    expect(exerciseSetsSchema.safeParse([{ weightKg: 40, reps }]).success).toBe(
      true,
    );
  });

  it.each([
    [0, WORKOUT_MESSAGES.SET_REPS_RANGE],
    [101, WORKOUT_MESSAGES.SET_REPS_RANGE],
    [2.5, WORKOUT_MESSAGES.SET_REPS_INTEGER],
  ])("rejects reps %s with a message", (reps, message) => {
    expect(firstMessage([{ weightKg: 40, reps }])).toBe(message);
  });

  // A6
  const rows = (count: number) =>
    Array.from({ length: count }, () => ({ weightKg: 20, reps: 8 }));

  it("accepts an empty list and 10 rows", () => {
    expect(exerciseSetsSchema.safeParse([]).success).toBe(true);
    expect(exerciseSetsSchema.safeParse(rows(10)).success).toBe(true);
  });

  it("rejects 11 rows with a message", () => {
    expect(firstMessage(rows(11))).toBe(WORKOUT_MESSAGES.SET_TOO_MANY);
  });
});

describe("areSetsEqual", () => {
  it("is true for the same sets in the same order, including two empty lists", () => {
    expect(areSetsEqual([], [])).toBe(true);
    expect(
      areSetsEqual([set(40, 10), set(null, 12)], [set(40, 10), set(null, 12)]),
    ).toBe(true);
  });

  it("is false when a weight or reps differ", () => {
    expect(areSetsEqual([set(40, 10)], [set(42.5, 10)])).toBe(false);
    expect(areSetsEqual([set(40, 10)], [set(40, 9)])).toBe(false);
  });

  it("treats bodyweight as different from any weight", () => {
    expect(areSetsEqual([set(null, 10)], [set(40, 10)])).toBe(false);
    expect(areSetsEqual([set(40, 10)], [set(null, 10)])).toBe(false);
  });

  it("is false when the order differs", () => {
    expect(
      areSetsEqual([set(40, 10), set(35, 8)], [set(35, 8), set(40, 10)]),
    ).toBe(false);
  });

  it("is false when a row was added or removed", () => {
    expect(areSetsEqual([set(40, 10)], [set(40, 10), set(40, 10)])).toBe(false);
    expect(areSetsEqual([], [set(40, 10)])).toBe(false);
    expect(areSetsEqual([set(40, 10)], [])).toBe(false);
  });
});
