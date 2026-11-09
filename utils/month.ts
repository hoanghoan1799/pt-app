import { addDays, getWeekdayIndex, isValidDate } from "@/utils/week";

// "YYYY-MM" of a "YYYY-MM-DD" date.
export const getMonthOf = (date: string) => date.slice(0, 7);

// The month `delta` months from `month` ("YYYY-MM").
export const shiftMonth = (month: string, delta: number) => {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

export const getMonthStart = (month: string) => `${month}-01`;

export const getMonthEnd = (month: string) =>
  addDays(getMonthStart(shiftMonth(month, 1)), -1);

// "Tháng 11, 2026"
export const formatMonthLabel = (month: string) => {
  const [year, number] = month.split("-");

  return `Tháng ${Number(number)}, ${year}`;
};

// A Monday-first month grid: `null` cells pad the first week so the 1st lands
// under its weekday; the last week is left short. Empty for an invalid month.
export const buildMonthCells = (month: string): (string | null)[] => {
  const first = getMonthStart(month);

  if (!isValidDate(first)) {
    return [];
  }

  const length = Number(getMonthEnd(month).slice(8, 10));
  const blanks = Array.from<null>({ length: getWeekdayIndex(first) }).fill(
    null,
  );
  const dates = Array.from(
    { length },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );

  return [...blanks, ...dates];
};
