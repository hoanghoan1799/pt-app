import { describe, expect, it } from "vitest";

import { parsePtFilter } from "@/features/dashboard/utils/pt-filter";

describe("parsePtFilter", () => {
  it.each([
    [undefined, "all"],
    ["", "all"],
    ["abc", "all"],
    ["0", "all"],
    ["-3", "all"],
    ["1.5", "all"],
    ["none", "none"],
    ["7", 7],
  ])("%j -> %j", (raw, expected) => {
    expect(parsePtFilter(raw)).toBe(expected);
  });
});
