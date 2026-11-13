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
  // size = octet_length(data) is a CHECK on every table that stores bytes.
  if (Buffer.isBuffer(row.data) && !("size" in values)) {
    row.size = row.data.length;
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

const PHOTO_LINKS = {
  chat: { photos: "chat_photos", owners: "chat_messages", column: "message_id" },
  dm: { photos: "dm_photos", owners: "dm_messages", column: "message_id" },
  social: {
    photos: "social_post_photos",
    owners: "social_posts",
    column: "post_id",
  },
} as const;

// Attaches a photo row (inserted with no owner) to its message or post the way
// the app does: the photo side first, then the owner's photo_id, in one
// transaction. The deferred foreign key on the photo side is checked at COMMIT
// and agrees with the owner's pointer.
export const linkPhoto = (
  dataSource: DataSource,
  kind: keyof typeof PHOTO_LINKS,
  ownerId: number,
  photoId: number,
) => {
  const link = PHOTO_LINKS[kind];

  return dataSource.transaction(async (manager) => {
    await manager.query(
      `UPDATE ${link.photos} SET ${link.column} = $1 WHERE id = $2`,
      [ownerId, photoId],
    );
    await manager.query(`UPDATE ${link.owners} SET photo_id = $1 WHERE id = $2`, [
      photoId,
      ownerId,
    ]);
  });
};
