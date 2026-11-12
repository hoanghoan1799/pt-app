import { describe, expect, it } from "vitest";

import {
  buildExerciseProgress,
  type ProgressSession,
} from "@/features/members/utils/progress";
import type { LoggedSet } from "@/features/workouts/utils/sets";

const WEEK_START = "2026-10-19";
const WEEK_END = "2026-10-25";
const SQUAT = "squatLink01";
const PUSH_UP = "pushUpLink1";

let nextExerciseId = 1;

const createSession = (
  date: string,
  sets: LoggedSet[],
  overrides: Partial<ProgressSession> = {},
): ProgressSession => ({
  userId: 1,
  youtubeId: SQUAT,
  date,
  exerciseId: nextExerciseId++,
  title: "Squat",
  sets,
  ...overrides,
});

const build = (sessions: ProgressSession[]) =>
  buildExerciseProgress(sessions, WEEK_START, WEEK_END);

describe("buildExerciseProgress", () => {
  it("compares the week's best with the best before it (C2)", () => {
    const rows = build([
      createSession("2026-10-12", [{ weightKg: 40, reps: 10 }]),
      createSession("2026-10-21", [
        { weightKg: 42.5, reps: 8 },
        { weightKg: 40, reps: 10 },
      ]),
    ]);

    expect(rows).toEqual([
      {
        youtubeId: SQUAT,
        title: "Squat",
        weekBest: { weightKg: 42.5, reps: 8 },
        previousBest: { weightKg: 40, reps: 10 },
        changeKg: 2.5,
        trend: "up",
        lastDate: "2026-10-21",
      },
    ]);
  });

  it("uses the best of all earlier weeks, not only the latest one", () => {
    const [row] = build([
      createSession("2026-10-05", [{ weightKg: 50, reps: 5 }]),
      createSession("2026-10-12", [{ weightKg: 40, reps: 10 }]),
      createSession("2026-10-20", [{ weightKg: 45, reps: 8 }]),
    ]);

    expect(row.previousBest).toEqual({ weightKg: 50, reps: 5 });
    expect(row.changeKg).toBe(-5);
    expect(row.trend).toBe("down");
  });

  it("counts more reps at the same weight as up, an exact tie as same", () => {
    const [moreReps] = build([
      createSession("2026-10-12", [{ weightKg: 40, reps: 10 }]),
      createSession("2026-10-20", [{ weightKg: 40, reps: 11 }]),
    ]);
    const [tie] = build([
      createSession("2026-10-12", [{ weightKg: 40, reps: 10 }]),
      createSession("2026-10-20", [{ weightKg: 40, reps: 10 }]),
    ]);

    expect(moreReps).toMatchObject({ changeKg: 0, trend: "up" });
    expect(tie).toMatchObject({ changeKg: 0, trend: "same" });
  });

  it("marks a link with no earlier weighted set as first (C5)", () => {
    const [onlyThisWeek] = build([
      createSession("2026-10-20", [{ weightKg: 40, reps: 10 }]),
      createSession("2026-10-22", [{ weightKg: 42.5, reps: 8 }]),
    ]);
    const [bodyweightBefore] = build([
      createSession("2026-10-12", [{ weightKg: null, reps: 15 }]),
      createSession("2026-10-20", [{ weightKg: 20, reps: 10 }]),
    ]);

    expect(onlyThisWeek).toMatchObject({
      weekBest: { weightKg: 42.5, reps: 8 },
      previousBest: null,
      changeKg: null,
      trend: "first",
      lastDate: "2026-10-22",
    });
    expect(bodyweightBefore).toMatchObject({
      previousBest: null,
      trend: "first",
    });
  });

  it("leaves out links with no weighted set in the week (C6)", () => {
    const rows = build([
      createSession("2026-10-12", [{ weightKg: 40, reps: 10 }]),
      createSession("2026-10-20", [{ weightKg: null, reps: 12 }]),
      createSession("2026-10-20", [{ weightKg: null, reps: 20 }], {
        youtubeId: PUSH_UP,
        title: "Hít đất",
      }),
      createSession("2026-10-13", [{ weightKg: 10, reps: 10 }], {
        youtubeId: "notThisWeek",
      }),
    ]);

    expect(rows).toEqual([]);
  });

  it("shows the latest title up to the selected week (C7)", () => {
    const [row] = build([
      createSession("2026-10-12", [{ weightKg: 40, reps: 10 }], {
        title: "Squat cũ",
      }),
      createSession("2026-10-20", [{ weightKg: 42.5, reps: 8 }], {
        title: "Back squat",
      }),
      createSession("2026-11-02", [{ weightKg: 45, reps: 8 }], {
        title: "Tên tuần sau",
      }),
    ]);

    expect(row.title).toBe("Back squat");
  });

  it("ignores sessions after the selected week", () => {
    const [row] = build([
      createSession("2026-10-20", [{ weightKg: 40, reps: 10 }]),
      createSession("2026-10-27", [{ weightKg: 60, reps: 10 }]),
    ]);

    expect(row.weekBest).toEqual({ weightKg: 40, reps: 10 });
  });

  it("sorts newest first, then by title", () => {
    const rows = build([
      createSession("2026-10-20", [{ weightKg: 40, reps: 10 }], {
        youtubeId: "a",
        title: "Bench",
      }),
      createSession("2026-10-23", [{ weightKg: 20, reps: 10 }], {
        youtubeId: "b",
        title: "Row",
      }),
      createSession("2026-10-20", [{ weightKg: 30, reps: 10 }], {
        youtubeId: "c",
        title: "Arnold press",
      }),
    ]);

    expect(rows.map((row) => row.title)).toEqual([
      "Row",
      "Arnold press",
      "Bench",
    ]);
  });
});
