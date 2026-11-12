import { describe, expect, it } from "vitest";

import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { exerciseSetsSchema } from "@/features/workouts/utils/sets";

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
