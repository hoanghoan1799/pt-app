import { createClient } from "@libsql/client";
import { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";

import { buildDataSourceOptions } from "../src/database/data-source-options.js";
import { MOVED_AVATARS } from "./migrate/avatars.js";
import { LEGACY_COLUMNS, LEGACY_TABLES } from "./migrate/chat-social.js";
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
// Columns SQLite has and PostgreSQL moved to another table: the avatar data
// URLs became rows of user_avatars / admin_avatars (scripts/migrate/avatars.ts
// decodes them while copying).
const SOURCE_ONLY_COLUMNS: Record<string, string[]> = {
  users: ["avatar"],
  admins: ["avatar"],
};
// Columns and tables SQLite has and PostgreSQL dropped (DbChatSocial): the data
// script counts them and aborts unless told to drop them
// (scripts/migrate/chat-social.ts).
const DROPPED_COLUMNS: Record<string, string[]> = {
  chat_messages: ["attachment_url", "attachment_meta"],
};
const DROPPED_TABLES = ["chat_nicknames"];
// Tables PostgreSQL has and SQLite never had.
const PG_ONLY_TABLES = ["sessions", "user_avatars", "admin_avatars"];

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

    expect(
      Object.keys(mapping.tables)
        .filter((name) => !DROPPED_TABLES.includes(name))
        .sort(),
    ).toEqual(entityTables);
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
        spec.columns
          .map((column) => column.name)
          .filter(
            (name) =>
              !SOURCE_ONLY_COLUMNS[entity.tableName]?.includes(name) &&
              !DROPPED_COLUMNS[entity.tableName]?.includes(name),
          )
          .sort(),
        entity.tableName,
      ).toEqual(entityColumns);
    }
  });

  it("moves exactly the columns the avatar transform handles", () => {
    expect(
      Object.fromEntries(
        MOVED_AVATARS.map((moved) => [moved.table, [moved.column]]),
      ),
    ).toEqual(SOURCE_ONLY_COLUMNS);
    expect(MOVED_AVATARS.map((moved) => moved.targetTable).sort()).toEqual(
      PG_ONLY_TABLES.filter((name) => name !== "sessions").sort(),
    );

    for (const moved of MOVED_AVATARS) {
      const columns = mapping.tables[moved.table].columns;

      // Text data URL plus the version column that stays behind.
      expect(columns.find((c) => c.name === moved.column)?.kind).toBe("text");
      expect(columns.find((c) => c.name === moved.versionColumn)?.kind).toBe(
        "timestamp_s",
      );
    }
  });

  it("drops exactly the legacy columns and tables the data script handles", () => {
    expect(DROPPED_COLUMNS).toEqual(LEGACY_COLUMNS);
    expect(DROPPED_TABLES).toEqual(LEGACY_TABLES);

    for (const [table, columns] of Object.entries(DROPPED_COLUMNS)) {
      for (const name of columns) {
        expect(
          mapping.tables[table].columns.some((column) => column.name === name),
          `${table}.${name}`,
        ).toBe(true);
      }
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
