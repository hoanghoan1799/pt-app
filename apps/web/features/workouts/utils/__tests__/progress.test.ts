import { describe, expect, it } from "vitest";

import type { Exercise, ScheduleDay } from "@/features/workouts/types/workout";
import {
  getDayProgress,
  getWeekProgress,
  isDayComplete,
} from "@/features/workouts/utils/progress";

const createExercise = (id: number, completedAt: number | null): Exercise => ({
  id,
  title: `Bài ${id}`,
  description: "",
  sets: null,
  reps: "",
  youtubeId: "dQw4w9WgXcQ",
  position: id,
  completedAt,
});

const createDay = (date: string, exercises: Exercise[]): ScheduleDay => ({
  date,
  title: "",
  note: "",
  exercises,
});

const DONE_DAY = createDay("2026-10-05", [
  createExercise(1, 1),
  createExercise(2, 2),
]);
const HALF_DAY = createDay("2026-10-06", [
  createExercise(3, 3),
  createExercise(4, null),
]);
const REST_DAY = createDay("2026-10-07", []);

describe("getDayProgress", () => {
  it("counts completed exercises", () => {
    expect(getDayProgress(HALF_DAY)).toEqual({
      completed: 1,
      total: 2,
      percent: 50,
    });
  });
});

describe("getWeekProgress", () => {
  it("sums every day", () => {
    expect(getWeekProgress([DONE_DAY, HALF_DAY, REST_DAY])).toEqual({
      completed: 3,
      total: 4,
      percent: 75,
    });
  });
});

describe("isDayComplete", () => {
  it("is true only when every exercise is done", () => {
    expect(isDayComplete(DONE_DAY)).toBe(true);
    expect(isDayComplete(HALF_DAY)).toBe(false);
    expect(isDayComplete(REST_DAY)).toBe(false);
  });
});
