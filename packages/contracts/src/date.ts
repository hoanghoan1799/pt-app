export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Dates are plain "YYYY-MM-DD" strings; arithmetic runs in UTC so the result
// never depends on the server's time zone.
export const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);

export const toDateString = (date: Date) => date.toISOString().slice(0, 10);

export const isValidDate = (
  value: string | undefined | null,
): value is string => {
  if (!value || !DATE_PATTERN.test(value)) {
    return false;
  }
  const date = toUtcDate(value);

  return !Number.isNaN(date.getTime()) && toDateString(date) === value;
};

export const addDays = (date: string, days: number) => {
  const result = toUtcDate(date);

  result.setUTCDate(result.getUTCDate() + days);
  return toDateString(result);
};
