import { resolve } from "node:path";

// Single source of truth for the e2e setup. The Next server gets the variables
// of E2E_ENV, never the ones from the shell or `.env.local`.
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
// Test results (and optional videos) of a run; recreated by the global setup.
export const E2E_TMP_DIR = resolve(__dirname, ".tmp");

// The API the web server calls (BFF), with its own PostgreSQL. Locally the API
// script (e2e/api-server.mjs) starts a throwaway PostgreSQL 17 container on
// E2E_PG_PORT; CI starts a service container and sets E2E_DATABASE_URL. The
// database name must contain "e2e": nothing else is ever wiped.
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
export const E2E_API_URL = `http://localhost:${E2E_API_PORT}`;
export const E2E_PG_PORT = Number(process.env.E2E_PG_PORT ?? 55432);
export const E2E_PG_CONTAINER =
  E2E_PG_PORT === 55432 ? "pt-e2e-pg" : `pt-e2e-pg-${E2E_PG_PORT}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ||
  `postgres://pt:pt_e2e_only@localhost:${E2E_PG_PORT}/ptapp_e2e`;

// Environment of the web server under test. Blank values are ignored by
// services/env.ts, so a value in the shell cannot leak in.
export const E2E_ENV = {
  API_URL: E2E_API_URL,
  VERCEL: "",
  // Registers public/sw.js under `next dev` (the worker is production-only otherwise).
  NEXT_PUBLIC_ENABLE_SW: "1",
  // The address the browser opens the realtime socket to (the API above).
  NEXT_PUBLIC_API_URL: E2E_API_URL,
  // See next.config.ts: the Babel React Compiler cannot spawn its loader here.
  E2E_RUST_REACT_COMPILER: "1",
  // Skips the image optimizer so no thumbnail is fetched server-side (KAN-95).
  E2E_UNOPTIMIZED_IMAGES: "1",
} as const;

export const E2E_USER_NAME = "E2E Trainee";

// Throwaway admin for the PT specs. It only exists in the e2e database.
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

// Trainee of the nutrition tab spec (KAN-125): a marked and an unmarked day, an
// extra food and a manual target (see seedNutritionInApi).
export const E2E_RINGS_NAME = "E2E Rings";
export const E2E_RINGS_EXTRA_FOOD = "E2E Bánh quy";

// Trainees of the login specs (KAN-86). Each spec that changes credentials or
// locks an account owns its trainee, so the specs do not depend on each other.
export const E2E_LOCKED_NAME = "E2E Locked";
export const E2E_CHANGER_NAME = "E2E Changer";
export const E2E_RESET_NAME = "E2E Reset";

// Trainees of the chat specs (KAN-102). The first one is never enabled for
// chat; the second one is enabled and locked again by the spec itself.
export const E2E_CHAT_OFF_NAME = "E2E Chat Off";
export const E2E_CHAT_NAME = "E2E Chatter";

// Every seeded trainee logs in with an email derived from the display name
// and this shared throwaway password (KAN-85).
export const E2E_USER_PASSWORD = "e2e-trainee-password";

export const e2eEmail = (name: string) =>
  `${name.toLowerCase().replaceAll(" ", ".")}@e2e.test`;

// Every trainee created by the global setup, in creation order: ids follow it
// and no spec depends on them. Nutrition, workouts and plans are added to these
// people afterwards (api-seed-workouts.ts, api-seed-nutrition.ts).
export const E2E_SEEDED_TRAINEES = [
  E2E_USER_NAME,
  E2E_LIFTER_NAME,
  E2E_EMPTY_NAME,
  E2E_LOCKED_NAME,
  E2E_CHANGER_NAME,
  E2E_RESET_NAME,
  E2E_CHAT_OFF_NAME,
  E2E_CHAT_NAME,
  E2E_PLANNER_NAME,
  E2E_LOGGER_NAME,
  E2E_RINGS_NAME,
] as const;
