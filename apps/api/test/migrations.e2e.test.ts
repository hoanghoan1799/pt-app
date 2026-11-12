import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entities } from "../src/database/entities/index.js";
import { migrations } from "../src/migrations/index.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

const EXPECTED_TABLES = 45; // 44 from db/schema.ts plus sessions

const publicTables = async (db: TestDatabase) => {
  const rows: { table_name: string }[] = await db.dataSource.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> 'migrations'`,
  );

  return rows.map((row) => row.table_name).sort();
};

describe("baseline migration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase({ migrated: false });
  });

  afterAll(async () => {
    await db.drop();
  });

  it("applies cleanly to an empty database", async () => {
    const applied = await db.dataSource.runMigrations({ transaction: "each" });

    expect(applied.map((m) => m.name)).toEqual(migrations.map((m) => m.name));
  });

  it("leaves no pending schema change (what migration:check enforces)", async () => {
    const { upQueries } = await db.dataSource.driver
      .createSchemaBuilder()
      .log();

    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it("creates a table for every registered entity", async () => {
    const expected = db.dataSource.entityMetadatas
      .map((metadata) => metadata.tableName)
      .sort();

    expect(entities).toHaveLength(EXPECTED_TABLES);
    expect(expected).toHaveLength(EXPECTED_TABLES);
    expect(await publicTables(db)).toEqual(expected);
  });

  it("installs the search extensions, the wrapper and the PG-only indexes", async () => {
    const extensions: { extname: string }[] = await db.dataSource.query(
      `SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm')`,
    );
    const functions: { provolatile: string }[] = await db.dataSource.query(
      `SELECT provolatile FROM pg_proc WHERE proname = 'immutable_unaccent'`,
    );
    const indexes: { indexname: string }[] = await db.dataSource.query(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('foods_name_key_trgm', 'chat_messages_body_search_trgm')`,
    );

    expect(extensions.map((e) => e.extname).sort()).toEqual([
      "pg_trgm",
      "unaccent",
    ]);
    // 'i' = IMMUTABLE, required to use the function in an index expression.
    expect(functions).toEqual([{ provolatile: "i" }]);
    expect(indexes.map((i) => i.indexname).sort()).toEqual([
      "chat_messages_body_search_trgm",
      "foods_name_key_trgm",
    ]);
  });

  it("reverts to an empty schema and applies again", async () => {
    // Newest first, down to the empty database.
    for (let applied = 0; applied < migrations.length; applied += 1) {
      await db.dataSource.undoLastMigration({ transaction: "each" });
    }
    expect(await publicTables(db)).toEqual([]);

    await db.dataSource.runMigrations({ transaction: "each" });
    expect(await publicTables(db)).toHaveLength(EXPECTED_TABLES);
  });
});
