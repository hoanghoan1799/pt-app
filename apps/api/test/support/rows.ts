import type { DataSource, EntityTarget, ObjectLiteral } from "typeorm";

let counter = 0;

// Throwaway value for a NOT NULL column the test does not care about.
const filler = (type: unknown) => {
  counter += 1;
  switch (type) {
    case "integer":
    case "double precision":
      return counter;
    case "boolean":
      return false;
    case "timestamptz":
      return new Date("2026-11-12T10:00:00.000Z");
    case "date":
      // A different day each time: (user, date) is unique in most tables.
      return new Date(Date.UTC(2026, 0, 1 + counter)).toISOString().slice(0, 10);
    case "bytea":
      return Buffer.from([1, 2, 3]);
    default:
      return `x${counter}`;
  }
};

// Inserts one row of any entity, filling every required column the caller left
// out (CHECK-constrained and foreign key columns must be passed). Returns the
// generated id when the table has one.
export const insertRow = async (
  dataSource: DataSource,
  entity: EntityTarget<ObjectLiteral>,
  values: Record<string, unknown>,
): Promise<number> => {
  const meta = dataSource.getMetadata(entity);
  const row: Record<string, unknown> = { ...values };

  for (const column of meta.columns) {
    if (
      column.isGenerated ||
      column.propertyName in row ||
      column.isNullable ||
      column.default !== undefined
    ) {
      continue;
    }
    row[column.propertyName] = filler(column.type);
  }
  const result = await dataSource.getRepository(entity).insert(row);

  return (result.identifiers[0]?.id as number | undefined) ?? 0;
};

// Row count of every table that has an entity.
export const countAllTables = async (dataSource: DataSource) => {
  const counts: Record<string, number> = {};

  for (const meta of dataSource.entityMetadatas) {
    const [{ count }] = (await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM "${meta.tableName}"`,
    )) as { count: number }[];

    counts[meta.tableName] = count;
  }
  return counts;
};

export const diffCounts = (
  after: Record<string, number>,
  before: Record<string, number>,
) =>
  Object.fromEntries(
    Object.keys(after)
      .map((table) => [table, after[table] - (before[table] ?? 0)] as const)
      .filter(([, delta]) => delta !== 0),
  );
