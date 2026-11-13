import { describe, expect, it } from "vitest";

import type { MemberProgress } from "./domain/progress.js";
import type { ScheduleDayWithSets } from "./domain/sets.js";
import {
  toActivityResponse,
  toDashboardSummaryResponse,
  toExerciseResponse,
  toScheduleResponse,
} from "./mappers.js";

describe("toExerciseResponse", () => {
  const exercise = {
    id: 7,
    title: "Plank",
    description: "",
    sets: null,
    reps: "30s",
    youtubeId: "dQw4w9WgXcQ",
    position: 2,
  };

  it("lists exactly the public fields and flags timed reps", () => {
    expect(toExerciseResponse(exercise)).toEqual({
      ...exercise,
      completedAt: null,
      timed: true,
    });
  });

  it("never leaks extra entity columns", () => {
    const response = toExerciseResponse({
      ...exercise,
      dayId: 3,
      createdAt: new Date(),
    } as typeof exercise);

    expect(Object.keys(response).sort()).toEqual([
      "completedAt",
      "description",
      "id",
      "position",
      "reps",
      "sets",
      "timed",
      "title",
      "youtubeId",
    ]);
  });

  it("writes the completion as an ISO string", () => {
    expect(
      toExerciseResponse(
        { ...exercise, reps: "10" },
        new Date("2026-11-10T12:00:00Z"),
      ),
    ).toMatchObject({ completedAt: "2026-11-10T12:00:00.000Z", timed: false });
  });
});

describe("toScheduleResponse", () => {
  it("carries logged sets, hints and the record flag per exercise", () => {
    const day: ScheduleDayWithSets = {
      date: "2026-11-09",
      title: "Legs",
      note: "",
      exercises: [
        {
          id: 1,
          title: "Squat",
          description: "",
          sets: 3,
          reps: "10",
          youtubeId: "dQw4w9WgXcQ",
          position: 0,
          completedAt: null,
          loggedSets: [{ weightKg: null, reps: 12 }],
          previousSets: [{ weightKg: 40, reps: 10 }],
          isPersonalBest: false,
        },
      ],
    };

    expect(toScheduleResponse([day]).days[0].exercises[0]).toMatchObject({
      loggedSets: [{ weightKg: null, reps: 12 }],
      previousSets: [{ weightKg: 40, reps: 10 }],
      isPersonalBest: false,
      timed: false,
    });
  });
});

describe("toDashboardSummaryResponse", () => {
  const member: MemberProgress = {
    id: 1,
    name: "An",
    displayName: "An",
    avatarUpdatedAt: new Date("2026-11-01T00:00:00Z"),
    ptAdminId: null,
    ptName: null,
    assigned: 4,
    completed: 3,
    plannedDays: 2,
    activeDays: 2,
    nutritionDays: 1,
    lastActiveAt: new Date("2026-11-10T00:00:00Z"),
  };

  it("derives percent and status and writes dates as ISO strings", () => {
    const summary = {
      memberCount: 1,
      plannedCount: 1,
      activeCount: 1,
      assigned: 4,
      completed: 3,
      percent: 75,
    };
    const response = toDashboardSummaryResponse(
      "2026-11-09",
      [member],
      summary,
    );

    expect(response.members[0]).toMatchObject({
      percent: 75,
      status: "in-progress",
      avatarUpdatedAt: "2026-11-01T00:00:00.000Z",
      lastActiveAt: "2026-11-10T00:00:00.000Z",
    });
    expect(response.summary).toBe(summary);
  });
});

describe("toActivityResponse", () => {
  it("uses the nickname when there is one, else the real name", () => {
    const base = {
      userName: "An",
      exerciseTitle: "Squat",
      date: "2026-11-09",
      occurredAt: Date.parse("2026-11-10T12:00:00Z"),
    };
    const response = toActivityResponse(
      [
        { kind: "completion", id: 1, userId: 1, ...base },
        { kind: "completion", id: 2, userId: 2, ...base },
      ],
      new Map([[1, "Bé An"]]),
    );

    expect(response.items.map((item) => item.displayName)).toEqual([
      "Bé An",
      "An",
    ]);
    expect(response.items[0].occurredAt).toBe("2026-11-10T12:00:00.000Z");
  });
});
