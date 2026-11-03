import { resolve } from "node:path";

// Single source of truth for the e2e database. Everything the e2e touches
// (Next server, drizzle-kit push, seed) gets this URL, never one from the
// shell or `.env.local`.
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_TMP_DIR = resolve(__dirname, ".tmp");
export const E2E_DB_PATH = resolve(E2E_TMP_DIR, "e2e.db");
// Forward slashes so the URL is also valid for libSQL on Windows.
export const E2E_DB_URL = `file:${E2E_DB_PATH.replaceAll("\\", "/")}`;

// services/env.ts prefers the TURSO_* pair, so both pairs are pinned and the
// tokens blanked. Blank values are ignored by readEnv, not used as fallbacks.
export const E2E_ENV = {
  DATABASE_URL: E2E_DB_URL,
  TURSO_DATABASE_URL: E2E_DB_URL,
  DATABASE_AUTH_TOKEN: "",
  TURSO_AUTH_TOKEN: "",
  SESSION_SECRET: "e2e-only-secret-at-least-32-characters-long",
  VERCEL: "",
  // Registers public/sw.js under `next dev` (the worker is production-only otherwise).
  NEXT_PUBLIC_ENABLE_SW: "1",
} as const;

export const E2E_USER_NAME = "E2E Trainee";

// Throwaway admin for the PT specs. It only exists in the scratch DB.
export const E2E_ADMIN = {
  username: "e2e-admin",
  password: "e2e-only-admin-password",
} as const;

// Trainees of the PT specs: one with logged sets, one with nothing logged.
export const E2E_LIFTER_NAME = "E2E Lifter";
export const E2E_EMPTY_NAME = "E2E Empty";

// Trainee of the meal plan specs (KAN-69): has a manual target of
// P 160 / C 235 / F 55 g (2,075 kcal) and no plan.
export const E2E_PLANNER_NAME = "E2E Planner";

// Trainee of the meal log specs (KAN-71): a manual target of
// P 160 / C 235 / F 55 g (2,075 kcal), a seeded plan for today of 2,084 kcal
// and one old free-text food entry.
export const E2E_LOGGER_NAME = "E2E Logger";

// Every seeded trainee logs in with an email derived from the display name
// and this shared throwaway password (KAN-85).
export const E2E_USER_PASSWORD = "e2e-trainee-password";

export const e2eEmail = (name: string) =>
  `${name.toLowerCase().replaceAll(" ", ".")}@e2e.test`;
