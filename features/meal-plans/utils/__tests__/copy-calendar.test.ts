import { describe, expect, it } from "vitest";

import {
  buildCopyMonth,
  canGoToPreviousMonth,
  formatMonthLabel,
  getMonthEnd,
  mergeMonthDates,
  shiftMonth,
} from "@/features/meal-plans/utils/copy-calendar";

const build = (
  month: string,
  today: string,
  sourceDate = "2000-01-01",
  datesWithPlan: string[] = [],
) => buildCopyMonth({ month, today, sourceDate, datesWithPlan });

const days = (cells: ReturnType<typeof build>) =>
  cells.filter((cell) => cell !== null);

describe("buildCopyMonth", () => {
  it("pads the first week so the 1st sits under its weekday (Monday first)", () => {
    // 1 Nov 2026 is a Sunday: six blanks, then the 1st in the last column.
    const cells = build("2026-11", "2026-11-05");

    expect(cells.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(cells[6]?.date).toBe("2026-11-01");
    expect(cells).toHaveLength(6 + 30);
  });

  it("has no blanks when the month starts on a Monday", () => {
    // 1 Jun 2026 is a Monday.
    const cells = build("2026-06", "2026-06-01");

    expect(cells[0]?.date).toBe("2026-06-01");
    expect(cells).toHaveLength(30);
  });

  it("pads five blanks for a month starting on Saturday", () => {
    // 1 Aug 2026 is a Saturday.
    const cells = build("2026-08", "2026-08-01");

    expect(cells.findIndex((cell) => cell !== null)).toBe(5);
    expect(days(cells)).toHaveLength(31);
  });

  it("has 29 days in a leap February and 28 otherwise", () => {
    expect(days(build("2028-02", "2028-02-01"))).toHaveLength(29);
    expect(days(build("2027-02", "2027-02-01"))).toHaveLength(28);
    expect(days(build("2100-02", "2100-02-01"))).toHaveLength(28);
    // 1 Feb 2028 is a Tuesday.
    expect(build("2028-02", "2028-02-01").findIndex(Boolean)).toBe(1);
  });

  it("flags today and tomorrow, and tomorrow can be the 1st of next month", () => {
    const cells = days(build("2026-11", "2026-11-30"));
    const today = cells.find((cell) => cell?.isToday);

    expect(today?.date).toBe("2026-11-30");
    expect(cells.filter((cell) => cell?.isTomorrow)).toHaveLength(0);

    const december = days(build("2026-12", "2026-11-30"));

    expect(december.find((cell) => cell?.isTomorrow)?.date).toBe("2026-12-01");
  });

  it("disables past days but not today or tomorrow", () => {
    const cells = days(build("2026-11", "2026-11-05"));
    const byDate = (date: string) => cells.find((cell) => cell?.date === date);

    expect(byDate("2026-11-04")).toMatchObject({
      isPast: true,
      isDisabled: true,
    });
    expect(byDate("2026-11-05")).toMatchObject({
      isToday: true,
      isPast: false,
      isDisabled: false,
    });
    expect(byDate("2026-11-06")).toMatchObject({
      isTomorrow: true,
      isDisabled: false,
    });
    expect(cells.filter((cell) => cell?.isPast)).toHaveLength(4);
  });

  it("disables the source day even in the future and flags days with a plan", () => {
    const cells = days(
      build("2026-11", "2026-11-05", "2026-11-10", [
        "2026-11-12",
        "2026-12-01",
      ]),
    );
    const byDate = (date: string) => cells.find((cell) => cell?.date === date);

    expect(byDate("2026-11-10")).toMatchObject({
      isSource: true,
      isPast: false,
      isDisabled: true,
    });
    expect(
      cells.filter((cell) => cell?.hasPlan).map((cell) => cell?.date),
    ).toEqual(["2026-11-12"]);
  });

  it("marks every day of a past month as past", () => {
    const cells = days(build("2026-10", "2026-11-05"));

    expect(cells.every((cell) => cell?.isPast && cell.isDisabled)).toBe(true);
  });
});

describe("month helpers", () => {
  it("shifts across year edges", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-11", 14)).toBe("2028-01");
  });

  it("finds the last day of a month", () => {
    expect(getMonthEnd("2028-02")).toBe("2028-02-29");
    expect(getMonthEnd("2026-12")).toBe("2026-12-31");
  });

  it("formats the label and blocks going before today's month", () => {
    expect(formatMonthLabel("2026-11")).toBe("Tháng 11, 2026");
    expect(canGoToPreviousMonth("2026-11", "2026-11-05")).toBe(false);
    expect(canGoToPreviousMonth("2026-12", "2026-11-05")).toBe(true);
  });
});

describe("mergeMonthDates", () => {
  const page = ["2026-11-06", "2026-11-09"];

  it("uses the page's dates while no month is read", () => {
    expect(mergeMonthDates(page, {}, "planDates")).toEqual(page);
  });

  it("lets a read month replace the page's dates for that month", () => {
    const loaded = {
      "2026-11": { planDates: ["2026-11-20"], logDates: [] },
    };

    expect(mergeMonthDates(page, loaded, "planDates")).toEqual(["2026-11-20"]);
  });

  it("keeps the page's dates for a month whose read failed", () => {
    const loaded = {
      "2026-11": null,
      "2026-12": { planDates: ["2026-12-01"], logDates: ["2026-12-02"] },
    };

    expect(mergeMonthDates(page, loaded, "planDates")).toEqual([
      "2026-11-06",
      "2026-11-09",
      "2026-12-01",
    ]);
    expect(mergeMonthDates([], loaded, "logDates")).toEqual(["2026-12-02"]);
  });
});
