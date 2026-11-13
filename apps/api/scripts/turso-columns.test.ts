import { createClient } from "@libsql/client";
import { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";

import { buildDataSourceOptions } from "../src/database/data-source-options.js";
import { loadTursoColumns } from "./turso-columns.js";
import { loadTursoSchemaStatements } from "./turso-schema.js";

// Columns PostgreSQL has and SQLite never had. The loader never inserts the
// generated ones (STORED account ids of the DbIntegrity migration: PostgreSQL
// derives them from the text key or kind + id pair); its column list comes
// from turso-columns.json.
const PG_ONLY_COLUMNS: Record<string, string[]> = {
  push_subscriptions: ["kind", "owner_user_id", "owner_admin_id"],
  social_posts: ["idempotency_key", "author_user_id", "author_admin_id"],
  chat_photos: ["client_id", "uploader_admin_id"],
  social_comments: ["author_user_id", "author_admin_id"],
  social_reactions: ["reactor_user_id", "reactor_admin_id"],
  social_notifications: [
    "recipient_user_id",
    "recipient_admin_id",
    "actor_user_id",
    "actor_admin_id",
  ],
  social_reports: ["reporter_user_id", "reporter_admin_id", "target_user_id"],
  social_post_photos: ["uploader_user_id", "uploader_admin_id"],
  chat_custom_stickers: ["owner_user_id", "owner_admin_id"],
  contact_aliases: [
    "owner_user_id",
    "owner_admin_id",
    "target_user_id",
    "target_admin_id",
  ],
  chat_reactions: ["reactor_admin_id"],
  chat_reads: ["reader_admin_id"],
};
// Tables PostgreSQL has and SQLite never had.
const PG_ONLY_TABLES = ["sessions"];

const buildMetadata = async () => {
  const dataSource = new DataSource(
    buildDataSourceOptions("postgres://pt:pw@localhost:1/none"),
  );

  await (
    dataSource as unknown as { buildMetadatas: () => Promise<void> }
  ).buildMetadatas();
  return dataSource.entityMetadatas;
};

describe("turso-columns.json against the frozen SQLite DDL", () => {
  it("lists the same tables, columns, storage classes, nullability and keys", async () => {
    const mapping = loadTursoColumns();
    const client = createClient({ url: ":memory:" });

    for (const statement of loadTursoSchemaStatements()) {
      await client.execute(statement);
    }

    const tables = (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
    ).rows.map((row) => String(row.name));

    expect(Object.keys(mapping.tables).sort()).toEqual(tables);

    for (const table of tables) {
      const info = (await client.execute(`PRAGMA table_info("${table}")`)).rows;
      const spec = mapping.tables[table];

      expect(
        info.map((row) => String(row.name)),
        table,
      ).toEqual(spec.columns.map((column) => column.name));

      for (const row of info) {
        const column = spec.columns.find((item) => item.name === row.name);

        expect(String(row.type).toLowerCase(), `${table}.${row.name}`).toBe(
          column?.sqliteType,
        );
        // An INTEGER PRIMARY KEY is NOT NULL by definition in the JSON.
        expect(
          Boolean(row.notnull) || Number(row.pk) > 0,
          `${table}.${row.name}`,
        ).toBe(column?.notNull);
      }
      expect(
        info
          .filter((row) => Number(row.pk) > 0)
          .map((row) => String(row.name))
          .sort(),
        table,
      ).toEqual([...spec.primaryKey].sort());
    }
    client.close();
  });
});

describe("turso-columns.json against the PostgreSQL entities", () => {
  const mapping = loadTursoColumns();

  it("covers 44 tables with the expected storage kinds", () => {
    const columns = Object.values(mapping.tables).flatMap((t) => t.columns);
    const count = (kind: string) =>
      columns.filter((column) => column.kind === kind).length;

    expect(Object.keys(mapping.tables)).toHaveLength(44);
    expect(count("timestamp_s") + count("timestamp_ms")).toBe(70);
    expect(count("boolean")).toBe(4);
    expect(count("blob")).toBe(4);
    expect(columns.filter((column) => column.enumValues).length).toBe(23);
    expect(columns.filter((column) => column.autoIncrement).length).toBe(31);
  });

  it("has the same table names as the entities (plus sessions)", async () => {
    const metadata = await buildMetadata();
    const entityTables = metadata
      .map((entity) => entity.tableName)
      .filter((name) => !PG_ONLY_TABLES.includes(name))
      .sort();

    expect(Object.keys(mapping.tables).sort()).toEqual(entityTables);
  });

  it("has the same column names as the entities, table by table", async () => {
    const metadata = await buildMetadata();

    for (const entity of metadata) {
      const spec = mapping.tables[entity.tableName];

      if (!spec) {
        continue;
      }

      const entityColumns = entity.columns
        .map((column) => column.databaseName)
        .filter((name) => !PG_ONLY_COLUMNS[entity.tableName]?.includes(name))
        .sort();

      expect(
        spec.columns.map((column) => column.name).sort(),
        entity.tableName,
      ).toEqual(entityColumns);
    }
  });

  it("agrees on the primary key columns", async () => {
    const metadata = await buildMetadata();

    for (const entity of metadata) {
      const spec = mapping.tables[entity.tableName];

      if (spec) {
        expect([...spec.primaryKey].sort(), entity.tableName).toEqual(
          entity.primaryColumns.map((column) => column.databaseName).sort(),
        );
      }
    }
  });
});
