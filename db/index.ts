import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "@/db/schema";
import { getDatabaseConfig } from "@/services/env";

type Database = LibSQLDatabase<typeof schema>;

let instance: Database | null = null;

const getDatabase = () => {
  instance ??= drizzle(createClient(getDatabaseConfig()), { schema });
  return instance;
};

// Connected on first use, so a missing/invalid DATABASE_URL surfaces as a
// classified error inside the request that needs the database (and in
// /api/health) instead of crashing every module that imports `db`.
export const db = new Proxy({} as Database, {
  get: (_target, property) => {
    const database = getDatabase();
    const value = Reflect.get(database, property, database);

    return typeof value === "function" ? value.bind(database) : value;
  },
});
