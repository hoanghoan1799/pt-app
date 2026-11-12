import { describe, expect, it } from "vitest";

import type { Exercise, ScheduleDay } from "@/features/workouts/types/workout";
import type { SetSession } from "@/features/workouts/utils/sets";
import { attachSetsToWeek } from "@/features/workouts/utils/week-sets";

const USER = 1;
const LINK = "dQw4w9WgXcQ";
const OTHER_LINK = "9bZkp7q19f0";

const exercise = (id: number, youtubeId = LINK): Exercise => ({
  id,
  title: `Bài ${id}`,
  description: "",
  sets: 3,
  reps: "10",
  youtubeId,
  position: 0,
  completedAt: null,
});

const day = (date: string, exercises: Exercise[]): ScheduleDay => ({
  date,
  title: "",
  note: "",
  exercises,
});

const session = (
  exerciseId: number,
  date: string,
  sets: SetSession["sets"],
  overrides: Partial<SetSession> = {},
): SetSession => ({
  userId: USER,
  youtubeId: LINK,
  date,
  exerciseId,
  sets,
  ...overrides,
});

const attachOne = (target: ScheduleDay, sessions: SetSession[]) =>
  attachSetsToWeek([target], USER, sessions)[0].exercises[0];

describe("attachSetsToWeek", () => {
  const today = day("2026-10-26", [exercise(10)]);

  it("gives empty sets, no hints and no record without history", () => {
    expect(attachOne(today, [])).toMatchObject({
      id: 10,
      loggedSets: [],
      previousSets: [],
      isPersonalBest: false,
    });
  });

  it("keeps days without exercises empty", () => {
    expect(attachSetsToWeek([day("2026-10-27", [])], USER, [])).toEqual([
      day("2026-10-27", []),
    ]);
  });

  it("attaches the exercise's own sets and the latest earlier session", () => {
    const result = attachOne(today, [
      session(1, "2026-10-12", [{ weightKg: 35, reps: 10 }]),
      session(2, "2026-10-19", [
        { weightKg: 40, reps: 10 },
        { weightKg: 40, reps: 8 },
      ]),
      session(10, "2026-10-26", [{ weightKg: 40, reps: 9 }]),
    ]);

    expect(result.loggedSets).toEqual([{ weightKg: 40, reps: 9 }]);
    expect(result.previousSets).toEqual([
      { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 8 },
    ]);
    expect(result.isPersonalBest).toBe(false);
  });

  it("never uses the same day, another link or another user as a hint", () => {
    const result = attachOne(today, [
      session(11, "2026-10-26", [{ weightKg: 50, reps: 5 }]),
      session(3, "2026-10-19", [{ weightKg: 60, reps: 5 }], {
        youtubeId: OTHER_LINK,
      }),
      session(4, "2026-10-19", [{ weightKg: 70, reps: 5 }], { userId: 2 }),
    ]);

    expect(result.previousSets).toEqual([]);
  });

  it("uses an earlier day of the same week as the previous session", () => {
    const [monday, thursday] = attachSetsToWeek(
      [day("2026-10-26", [exercise(10)]), day("2026-10-29", [exercise(13)])],
      USER,
      [session(10, "2026-10-26", [{ weightKg: 40, reps: 10 }])],
    );

    expect(monday.exercises[0].previousSets).toEqual([]);
    expect(thursday.exercises[0].previousSets).toEqual([
      { weightKg: 40, reps: 10 },
    ]);
  });

  it("takes the lowest exercise id when the link appears twice on that date", () => {
    const result = attachOne(today, [
      session(6, "2026-10-19", [{ weightKg: 30, reps: 12 }]),
      session(5, "2026-10-19", [{ weightKg: 40, reps: 10 }]),
    ]);

    expect(result.previousSets).toEqual([{ weightKg: 40, reps: 10 }]);
  });

  it("flags a record only when beating every earlier weighted set", () => {
    const history = [session(1, "2026-10-19", [{ weightKg: 40, reps: 10 }])];
    const withToday = (sets: SetSession["sets"]) =>
      attachOne(today, [...history, session(10, "2026-10-26", sets)]);

    expect(withToday([{ weightKg: 42.5, reps: 5 }]).isPersonalBest).toBe(true);
    expect(withToday([{ weightKg: 40, reps: 11 }]).isPersonalBest).toBe(true);
    expect(withToday([{ weightKg: 40, reps: 10 }]).isPersonalBest).toBe(false);
    expect(withToday([{ weightKg: null, reps: 30 }]).isPersonalBest).toBe(
      false,
    );
  });

  it("does not flag the first-ever weighted set as a record (D11)", () => {
    const result = attachOne(today, [
      session(1, "2026-10-19", [{ weightKg: null, reps: 15 }]),
      session(10, "2026-10-26", [{ weightKg: 20, reps: 10 }]),
    ]);

    expect(result.isPersonalBest).toBe(false);
  });
});
