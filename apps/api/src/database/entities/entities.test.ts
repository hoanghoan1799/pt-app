import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";

import { buildDataSourceOptions } from "../data-source-options.js";
import { entities } from "./index.js";

const entityFiles = readdirSync(dirname(fileURLToPath(import.meta.url))).filter(
  (file) => file.endsWith(".entity.ts"),
);

// Builds the TypeORM metadata (relations, FKs, indexes) without a connection.
const buildMetadata = async () => {
  const dataSource = new DataSource(
    buildDataSourceOptions("postgres://pt:pw@localhost:1/none"),
  );

  await (
    dataSource as unknown as { buildMetadatas: () => Promise<void> }
  ).buildMetadatas();
  return dataSource.entityMetadatas;
};

describe("entities", () => {
  it("registers every *.entity.ts file exactly once (44 tables, sessions and the two avatar tables)", () => {
    expect(entityFiles).toHaveLength(47);
    expect(entities).toHaveLength(47);
    expect(new Set(entities).size).toBe(47);
  });

  it("has valid metadata: unique table names, real FKs with explicit ON DELETE", async () => {
    const metadata = await buildMetadata();
    const tables = metadata.map((entity) => entity.tableName);
    const foreignKeys = metadata.flatMap((entity) => entity.foreignKeys);

    expect(new Set(tables).size).toBe(47);
    // 24 declared + 43 formerly logical + 2 on sessions + 2 on the avatar tables.
    expect(foreignKeys).toHaveLength(71);
    expect(foreignKeys.every((fk) => fk.onDelete !== undefined)).toBe(true);
  });

  it("keeps primary keys as identity ALWAYS and enums as text, not PG enums", async () => {
    const metadata = await buildMetadata();
    const columns = metadata.flatMap((entity) => entity.columns);

    expect(columns.some((column) => column.type === "enum")).toBe(false);

    const identities = columns.filter(
      (column) =>
        column.isGenerated &&
        (column.generationStrategy as string) === "identity",
    );

    expect(identities.length).toBeGreaterThan(0);
    expect(identities.every((c) => c.generatedIdentity === "ALWAYS")).toBe(
      true,
    );
  });
});
