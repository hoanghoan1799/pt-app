import type { ScheduleDayResponse } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { toScheduleDays } from "@/features/workouts/utils/schedule-response";

const day: ScheduleDayResponse = {
  date: "2026-11-02",
  title: "Push",
  note: "n",
  exercises: [
    {
      id: 1,
      title: "Bench",
      description: "",
      sets: 3,
      reps: "10",
      youtubeId: "dQw4w9WgXcQ",
      position: 0,
      completedAt: "2023-11-14T22:13:20.000Z",
      timed: false,
      loggedSets: [{ weightKg: 40, reps: 10 }],
      previousSets: [{ weightKg: null, reps: 12 }],
      isPersonalBest: true,
    },
    {
      id: 2,
      title: "Plank",
      description: "",
      sets: null,
      reps: "30s",
      youtubeId: "9bZkp7q19f0",
      position: 1,
      completedAt: null,
      timed: true,
      loggedSets: [],
      previousSets: [],
      isPersonalBest: false,
    },
  ],
};

describe("toScheduleDays", () => {
  it("turns completion times into epoch ms and keeps sets, hints and the record flag", () => {
    const [mapped] = toScheduleDays([day]);

    expect(mapped.exercises[0]).toEqual({
      id: 1,
      title: "Bench",
      description: "",
      sets: 3,
      reps: "10",
      youtubeId: "dQw4w9WgXcQ",
      position: 0,
      completedAt: 1_700_000_000_000,
      loggedSets: [{ weightKg: 40, reps: 10 }],
      previousSets: [{ weightKg: null, reps: 12 }],
      isPersonalBest: true,
    });
    expect(mapped.exercises[1].completedAt).toBeNull();
  });

  it("keeps empty days", () => {
    expect(
      toScheduleDays([
        { date: "2026-11-03", title: "", note: "", exercises: [] },
      ]),
    ).toEqual([{ date: "2026-11-03", title: "", note: "", exercises: [] }]);
  });
});
