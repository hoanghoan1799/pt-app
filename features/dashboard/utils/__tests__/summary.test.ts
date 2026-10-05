import { describe, expect, it } from "vitest";

import type { MemberProgress } from "@/features/dashboard/types/dashboard";
import {
  summarizeWeek,
  toMemberRows,
} from "@/features/dashboard/utils/summary";

const NOW = Date.parse("2026-10-05T12:00:00Z");

const createMember = (
  id: number,
  assigned: number,
  completed: number,
  lastActiveAt: number | null = null,
): MemberProgress => ({
  id,
  name: `User ${id}`,
  assigned,
  completed,
  plannedDays: assigned ? 1 : 0,
  activeDays: completed ? 1 : 0,
  nutritionDays: 0,
  lastActiveAt,
});

const MEMBERS = [
  createMember(1, 0, 0),
  createMember(2, 4, 0),
  createMember(3, 4, 2, NOW - 2 * 60 * 60 * 1000),
  createMember(4, 2, 2, NOW - 30 * 1000),
];

describe("summarizeWeek", () => {
  it("totals members and exercises", () => {
    expect(summarizeWeek(MEMBERS)).toEqual({
      memberCount: 4,
      plannedCount: 3,
      activeCount: 2,
      assigned: 10,
      completed: 4,
      percent: 40,
    });
  });

  it("handles no members", () => {
    expect(summarizeWeek([]).percent).toBe(0);
  });
});

describe("toMemberRows", () => {
  const rows = toMemberRows(MEMBERS, {
    weekStart: "2026-10-05",
    timeZone: "Asia/Ho_Chi_Minh",
    now: NOW,
    getHref: (id, week) => `/admin/users/${id}?week=${week}`,
  });

  it("derives a status per member", () => {
    expect(rows.map((row) => row.status)).toEqual([
      "no-plan",
      "not-started",
      "in-progress",
      "done",
    ]);
  });

  it("formats last activity and links", () => {
    expect(rows[0].lastActiveLabel).toBeNull();
    expect(rows[2].lastActiveLabel).toBe("2 giờ trước");
    expect(rows[3].href).toBe("/admin/users/4?week=2026-10-05");
    expect(rows[2].percent).toBe(50);
  });
});
