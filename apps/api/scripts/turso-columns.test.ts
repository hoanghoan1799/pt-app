import { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";

import { buildDataSourceOptions } from "../src/database/data-source-options.js";
import { loadTursoColumns } from "./turso-columns.js";

// Columns PostgreSQL has and SQLite never had; the migration fills them.
const PG_ONLY_COLUMNS: Record<string, string[]> = {
  push_subscriptions: ["kind"],
  // Nullable, filled only by API clients that send an Idempotency-Key.
  social_posts: ["idempotency_key"],
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
