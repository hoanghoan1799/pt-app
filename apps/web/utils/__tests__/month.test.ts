import { describe, expect, it } from "vitest";

import {
  buildMonthCells,
  formatMonthLabel,
  getMonthEnd,
  getMonthOf,
  getMonthStart,
  shiftMonth,
} from "@/utils/month";

describe("shiftMonth", () => {
  it("moves within a year", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-11", -1)).toBe("2026-10");
  });

  it("crosses year boundaries in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 14)).toBe("2028-01");
  });
});

describe("getMonthOf / getMonthStart", () => {
  it("reads and builds month keys", () => {
    expect(getMonthOf("2026-11-09")).toBe("2026-11");
    expect(getMonthStart("2026-11")).toBe("2026-11-01");
  });
});

describe("getMonthEnd", () => {
  it("handles February in a leap and a common year", () => {
    expect(getMonthEnd("2028-02")).toBe("2028-02-29");
    expect(getMonthEnd("2027-02")).toBe("2027-02-28");
  });

  it("handles 30 and 31 day months", () => {
    expect(getMonthEnd("2026-11")).toBe("2026-11-30");
    expect(getMonthEnd("2026-12")).toBe("2026-12-31");
  });
});

describe("formatMonthLabel", () => {
  it("formats without a leading zero", () => {
    expect(formatMonthLabel("2026-11")).toBe("Tháng 11, 2026");
    expect(formatMonthLabel("2026-02")).toBe("Tháng 2, 2026");
  });
});

describe("buildMonthCells", () => {
  it("pads a month starting on Sunday with 6 blanks", () => {
    const cells = buildMonthCells("2026-11");

    expect(cells).toHaveLength(36);
    expect(cells.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(cells[6]).toBe("2026-11-01");
    expect(cells.at(-1)).toBe("2026-11-30");
    expect(cells.filter(Boolean)).toHaveLength(30);
  });

  it("adds no blanks when the month starts on Monday", () => {
    const cells = buildMonthCells("2026-06");

    expect(cells[0]).toBe("2026-06-01");
    expect(cells).toHaveLength(30);
  });

  it("returns nothing for an invalid month", () => {
    expect(buildMonthCells("2026-13")).toEqual([]);
    expect(buildMonthCells("abc")).toEqual([]);
  });
});
