import { mkdirSync, rmSync } from "node:fs";

import { seedApiTrainees } from "./api-seed";
import { seedNutritionInApi } from "./api-seed-nutrition";
import { seedApiWorkouts } from "./api-seed-workouts";
import { E2E_TMP_DIR } from "./config";

// The API and its PostgreSQL are started by the first webServer entry of
// playwright.config.ts (e2e/api-server.mjs, which empties and migrates the e2e
// database and refuses any database whose name lacks "e2e"). Everything the
// specs start from is created through the API's own endpoints.
const globalSetup = async () => {
  rmSync(E2E_TMP_DIR, { recursive: true, force: true });
  mkdirSync(E2E_TMP_DIR, { recursive: true });

  await seedApiTrainees();
  await seedApiWorkouts();
  await seedNutritionInApi();
};

export default globalSetup;
