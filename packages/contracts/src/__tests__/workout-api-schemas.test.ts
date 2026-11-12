import {
  activityQuerySchema,
  copyDayRequestSchema,
  dashboardSummaryQuerySchema,
  dateRangeQuerySchema,
  deleteExerciseQuerySchema,
  exerciseRequestSchema,
  exerciseSetsSchema,
  saveWorkoutDayRequestSchema,
  traineeDayPathSchema,
} from "../workout-api-schemas.js";
import { WORKOUT_MESSAGES } from "../workouts.js";
import { describe, expect, it } from "vitest";

const LINK = "dQw4w9WgXcQ";

describe("exerciseRequestSchema", () => {
  it("normalises the link to a video id and defaults the optional fields", () => {
    expect(
      exerciseRequestSchema.parse({
        title: " Squat ",
        youtubeUrl: `https://youtu.be/${LINK}?t=3`,
      }),
    ).toEqual({
      title: "Squat",
      youtubeUrl: LINK,
      reps: "",
      description: "",
      sets: null,
      confirmResetSets: false,
    });
  });

  it("reads confirmResetSets only as the boolean true", () => {
    const base = { title: "A", youtubeUrl: LINK };

    expect(
      exerciseRequestSchema.parse({ ...base, confirmResetSets: true })
        .confirmResetSets,
    ).toBe(true);
    expect(
      exerciseRequestSchema.safeParse({ ...base, confirmResetSets: "true" })
        .success,
    ).toBe(false);
  });

  it.each([
    [{ sets: 0 }, "Ít nhất 1 hiệp"],
    [{ sets: 51 }, "Tối đa 50 hiệp"],
    [{ sets: 1.5 }, "Số hiệp phải là số nguyên"],
    [{ sets: "3" }, "Số hiệp phải là số"],
    [{ youtubeUrl: "https://vimeo.com/123" }, "Link YouTube không hợp lệ"],
    [{ title: " " }, "Nhập tên bài tập"],
  ])("refuses %j", (patch, message) => {
    const result = exerciseRequestSchema.safeParse({
      title: "A",
      youtubeUrl: LINK,
      ...patch,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});

describe("saveWorkoutDayRequestSchema", () => {
  it("trims and defaults to empty text", () => {
    expect(saveWorkoutDayRequestSchema.parse({ title: " Push " })).toEqual({
      title: "Push",
      note: "",
    });
  });
});

describe("exerciseSetsSchema", () => {
  it("accepts bodyweight and half kilos, refuses other steps", () => {
    expect(
      exerciseSetsSchema.safeParse([
        { weightKg: null, reps: 12 },
        { weightKg: 42.5, reps: 8 },
      ]).success,
    ).toBe(true);
    expect(
      exerciseSetsSchema.safeParse([{ weightKg: 42.3, reps: 8 }]).error
        ?.issues[0].message,
    ).toBe(WORKOUT_MESSAGES.SET_WEIGHT_STEP);
  });
});

describe("dateRangeQuerySchema", () => {
  it("accepts up to 42 days and refuses a reversed or wider range", () => {
    expect(
      dateRangeQuerySchema.safeParse({ from: "2026-11-01", to: "2026-12-13" })
        .success,
    ).toBe(true);
    expect(
      dateRangeQuerySchema.safeParse({ from: "2026-11-01", to: "2026-12-14" })
        .success,
    ).toBe(false);
    expect(
      dateRangeQuerySchema.safeParse({ from: "2026-11-02", to: "2026-11-01" })
        .success,
    ).toBe(false);
  });

  it("refuses an impossible calendar date", () => {
    expect(
      dateRangeQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-01" })
        .success,
    ).toBe(false);
  });
});

describe("copyDayRequestSchema", () => {
  it("needs a source date and one to fourteen target dates", () => {
    const date = "2026-11-12";

    expect(
      copyDayRequestSchema.safeParse({ date, dates: ["2026-11-13"] }).success,
    ).toBe(true);
    expect(copyDayRequestSchema.safeParse({ date, dates: [] }).success).toBe(
      false,
    );
    expect(
      copyDayRequestSchema.safeParse({
        date,
        dates: Array.from({ length: 15 }, () => "2026-11-13"),
      }).success,
    ).toBe(false);
  });
});

describe("path and query schemas", () => {
  it("reads ids as plain digits", () => {
    expect(
      traineeDayPathSchema.parse({ userId: "12", date: "2026-11-12" }),
    ).toEqual({ userId: 12, date: "2026-11-12" });

    for (const userId of ["1e3", " 7", "-1", "0", "abc", "1234567890"]) {
      expect(
        traineeDayPathSchema.safeParse({ userId, date: "2026-11-12" }).success,
        userId,
      ).toBe(false);
    }
  });

  it("reads confirmDeleteSets as true only for the text true", () => {
    expect(deleteExerciseQuerySchema.parse({})).toEqual({
      confirmDeleteSets: false,
    });
    expect(
      deleteExerciseQuerySchema.parse({ confirmDeleteSets: "true" }),
    ).toEqual({ confirmDeleteSets: true });
    expect(
      deleteExerciseQuerySchema.safeParse({ confirmDeleteSets: "1" }).success,
    ).toBe(false);
  });

  it("parses the dashboard PT filter like the web (garbage = everyone)", () => {
    const pt = (value?: string) =>
      dashboardSummaryQuerySchema.parse({ pt: value }).pt;

    expect(pt()).toBe("all");
    expect(pt("none")).toBe("none");
    expect(pt("4")).toBe(4);
    expect(pt("0")).toBe("all");
    expect(pt("-2")).toBe("all");
    expect(pt("1.5")).toBe("all");
    expect(pt("abc")).toBe("all");
  });

  it("limits the activity feed to 1-50", () => {
    expect(activityQuerySchema.parse({ limit: "20" }).limit).toBe(20);
    expect(activityQuerySchema.parse({}).limit).toBeUndefined();
    for (const limit of ["0", "51", "x", "-1"]) {
      expect(activityQuerySchema.safeParse({ limit }).success, limit).toBe(
        false,
      );
    }
  });
});
