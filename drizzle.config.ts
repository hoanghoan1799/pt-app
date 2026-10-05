import { defineConfig } from "drizzle-kit";

// Same precedence as services/env.ts: the Vercel ↔ Turso integration's
// variables first, then the local DATABASE_URL.
const url =
  process.env.TURSO_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "file:local.db";
const authToken =
  process.env.TURSO_AUTH_TOKEN?.trim() ||
  process.env.DATABASE_AUTH_TOKEN?.trim() ||
  undefined;

export default defineConfig({
  dialect: "turso",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url, authToken },
});
