import { createClient } from "@libsql/client";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "@/db/schema";

// A throwaway in-memory SQLite database with the real schema, created from
// db/schema.ts so tests never drift from the tables the app uses.
export const createTestDb = async () => {
  const client = createClient({ url: ":memory:" });
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema);
  const statements = await generateSQLiteMigration(empty, current);

  for (const statement of statements) {
    await client.execute(statement);
  }
  return drizzle(client, { schema });
};

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
