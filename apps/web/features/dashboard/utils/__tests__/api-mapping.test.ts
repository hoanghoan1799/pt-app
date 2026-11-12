import type { ActivityResponse, DashboardSummaryResponse } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  toActivityItems,
  toMemberProgress,
} from "@/features/dashboard/utils/api-mapping";

const member = (
  overrides: Partial<DashboardSummaryResponse["members"][number]> = {},
): DashboardSummaryResponse["members"][number] => ({
  id: 7,
  name: "Binh",
  displayName: "Bé Bình",
  avatarUpdatedAt: null,
  ptAdminId: 2,
  ptName: "pt",
  assigned: 4,
  completed: 2,
  plannedDays: 3,
  activeDays: 1,
  nutritionDays: 5,
  lastActiveAt: null,
  percent: 50,
  status: "in-progress",
  ...overrides,
});

describe("toMemberProgress", () => {
  it("carries the nickname and the versioned avatar URL, else none", () => {
    const withPhoto = toMemberProgress(
      member({ avatarUpdatedAt: "2023-11-14T22:13:20.000Z" }),
    );

    expect(withPhoto.displayName).toBe("Bé Bình");
    expect(withPhoto.name).toBe("Binh");
    expect(withPhoto.avatarUrl).toBe("/api/avatar/user/7?v=1700000000");
    expect(toMemberProgress(member()).avatarUrl).toBeNull();
  });

  it("turns the last activity into epoch milliseconds", () => {
    expect(
      toMemberProgress(member({ lastActiveAt: "2023-11-14T22:13:20.000Z" }))
        .lastActiveAt,
    ).toBe(1_700_000_000_000);
    expect(toMemberProgress(member()).lastActiveAt).toBeNull();
  });
});

describe("toActivityItems", () => {
  const base = {
    id: 3,
    userId: 7,
    userName: "Binh",
    displayName: "Bé Bình",
    exerciseTitle: "Squat",
    date: "2026-11-02",
    occurredAt: "2023-11-14T22:13:20.000Z",
  };

  it("maps a completion and a personal best, keeping the nickname", () => {
    const items: ActivityResponse["items"] = [
      { kind: "completion", ...base },
      {
        kind: "personalBest",
        ...base,
        best: { weightKg: 60, reps: 5 },
        previousBest: { weightKg: 55, reps: 5 },
      },
    ];

    expect(toActivityItems(items)).toEqual([
      { kind: "completion", ...base, occurredAt: 1_700_000_000_000 },
      {
        kind: "personalBest",
        ...base,
        occurredAt: 1_700_000_000_000,
        best: { weightKg: 60, reps: 5 },
        previousBest: { weightKg: 55, reps: 5 },
      },
    ]);
  });
});
