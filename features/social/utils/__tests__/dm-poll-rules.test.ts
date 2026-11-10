import { describe, expect, it } from "vitest";

import {
  dmPollDelayMs,
  dmPollHadActivity,
  nextEmptyPolls,
} from "@/features/social/utils/dm-poll-rules";

describe("dmPollDelayMs", () => {
  it("keeps the 5 s base for the first empty polls", () => {
    expect([0, 1, 2, 3].map(dmPollDelayMs)).toEqual([5000, 5000, 5000, 5000]);
  });

  it("backs off one step per empty poll after that", () => {
    expect([4, 5, 6].map(dmPollDelayMs)).toEqual([10_000, 15_000, 20_000]);
  });

  it("never exceeds 20 s", () => {
    expect(dmPollDelayMs(7)).toBe(20_000);
    expect(dmPollDelayMs(1000)).toBe(20_000);
  });
});

describe("dmPollHadActivity", () => {
  it("is quiet when nothing came back", () => {
    expect(dmPollHadActivity(0, 0, false)).toBe(false);
  });

  it("counts messages, deletions and a moved read marker", () => {
    expect(dmPollHadActivity(1, 0, false)).toBe(true);
    expect(dmPollHadActivity(0, 1, false)).toBe(true);
    expect(dmPollHadActivity(0, 0, true)).toBe(true);
  });
});

describe("nextEmptyPolls", () => {
  it("counts up on empty polls and resets on activity", () => {
    expect(nextEmptyPolls(0, false)).toBe(1);
    expect(nextEmptyPolls(5, false)).toBe(6);
    expect(nextEmptyPolls(5, true)).toBe(0);
  });
});
