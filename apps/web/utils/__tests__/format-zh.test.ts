import { describe, expect, it } from "vitest";

import { formatMonthLabel } from "@/utils/month";
import { formatShortDate } from "@/utils/time";
import { formatDayMonth, formatWeekTitle, getWeekdayLabel } from "@/utils/week";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

describe("Chinese date formatting", () => {
  it("writes days as month月day日", () => {
    expect(formatDayMonth("2026-11-02", "zh")).toBe("11月2日");
    expect(
      formatShortDate(Date.parse("2026-10-05T05:00:00Z"), TIME_ZONE, "zh"),
    ).toBe("10月5日");
  });

  it("titles a week for each month and year span", () => {
    expect(formatWeekTitle("2026-11-02", "zh")).toBe("2026年11月2–8日");
    expect(formatWeekTitle("2026-10-26", "zh")).toBe("2026年10月26日–11月1日");
    expect(formatWeekTitle("2026-12-28", "zh")).toBe(
      "2026年12月28日 – 2027年1月3日",
    );
  });

  it("names weekdays and months in Chinese", () => {
    expect(getWeekdayLabel("2026-11-08", "zh")).toMatch(/^(星期日|周日)$/);
    expect(formatMonthLabel("2026-11", "zh")).toBe("2026年11月");
  });
});
