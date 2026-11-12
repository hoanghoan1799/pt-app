// `dataSource.query()` of an UPDATE / DELETE ... RETURNING resolves to
// `[rows, affectedCount]` in TypeORM; an INSERT or SELECT resolves to the rows.
// This reads the rows either way.
export const returnedRows = <T>(result: unknown): T[] => {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
  ) {
    return result[0] as T[];
  }
  return result as T[];
};
