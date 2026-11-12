// TypeORM's PostgreSQL `query()` returns `[rows, affectedCount]` for UPDATE and
// DELETE (even with RETURNING) but the plain rows for SELECT and INSERT. This
// gives the rows in every case.
export const rowsOf = <T>(result: unknown): T[] =>
  Array.isArray(result) &&
  result.length === 2 &&
  Array.isArray(result[0]) &&
  typeof result[1] === "number"
    ? (result[0] as T[])
    : (result as T[]);
