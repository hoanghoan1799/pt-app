import { describe, expect, it } from "vitest";

import {
  getMemberStatus,
  type MemberProgress,
  summarizeWeek,
} from "./progress.js";

const NOW = Date.parse("2026-10-05T12:00:00Z");

const createMember = (
  id: number,
  assigned: number,
  completed: number,
  lastActiveAt: Date | null = null,
): MemberProgress => ({
  id,
  name: `User ${id}`,
  displayName: `User ${id}`,
  avatarUpdatedAt: null,
  ptAdminId: null,
  ptName: null,
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
  createMember(3, 4, 2, new Date(NOW - 2 * 60 * 60 * 1000)),
  createMember(4, 2, 2, new Date(NOW - 30 * 1000)),
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

describe("getMemberStatus", () => {
  it("derives a status per member", () => {
    expect(MEMBERS.map(getMemberStatus)).toEqual([
      "no-plan",
      "not-started",
      "in-progress",
      "done",
    ]);
  });
});
