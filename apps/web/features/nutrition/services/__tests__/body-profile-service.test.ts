import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { bodyProfiles, nutritionTargets, users } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { saveBodyProfile } =
  await import("@/features/nutrition/services/body-profile-service");

const TODAY = "2026-10-05";
const BODY = {
  sex: "male" as const,
  age: 30,
  heightCm: 175,
  weightKg: 75,
  activityLevel: "moderate" as const,
};

let db: TestDb;

const readProfile = async () =>
  (await db.select().from(bodyProfiles).where(eq(bodyProfiles.userId, 1)))[0];
const readTarget = async () =>
  (
    await db
      .select()
      .from(nutritionTargets)
      .where(eq(nutritionTargets.userId, 1))
  )[0];

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  await db.insert(users).values({ name: "An", nameKey: "an" });
});

describe("saveBodyProfile", () => {
  it("admin save stores the energy model and derives the target from it", async () => {
    await saveBodyProfile(
      1,
      { ...BODY, kcalAdjustment: -200, proteinPerKg: 2 },
      "always",
      TODAY,
    );

    expect(await readProfile()).toMatchObject({
      kcalAdjustment: -200,
      proteinPerKg: 2,
      goal: "cut",
    });
    // TDEE 2633 − 200: see energy.test.ts.
    expect(await readTarget()).toMatchObject({
      carbs: 300,
      protein: 150,
      fat: 70,
      source: "tdee",
    });
  });

  it("writes the goal derived from the adjustment sign on insert and update", async () => {
    await saveBodyProfile(
      1,
      { ...BODY, kcalAdjustment: -200, proteinPerKg: 2 },
      "never",
      TODAY,
    );
    await saveBodyProfile(
      1,
      { ...BODY, kcalAdjustment: 300, proteinPerKg: 2 },
      "never",
      TODAY,
    );

    expect(await readProfile()).toMatchObject({
      kcalAdjustment: 300,
      goal: "bulk",
    });
  });

  it("a member's own save keeps null fields null (legacy numbers)", async () => {
    await saveBodyProfile(1, { ...BODY, goal: "cut" }, "unless-manual", TODAY);

    expect(await readProfile()).toMatchObject({
      kcalAdjustment: null,
      proteinPerKg: null,
      goal: "cut",
    });
    // Legacy cut: TDEE 2633 × 0.8, protein 75 × 2.2 = 165 g.
    expect(await readTarget()).toMatchObject({ protein: 165 });
  });

  it("a member's own save never touches kcal_adjustment, protein_per_kg or the goal once set", async () => {
    await saveBodyProfile(
      1,
      { ...BODY, kcalAdjustment: -200, proteinPerKg: 2 },
      "never",
      TODAY,
    );
    await saveBodyProfile(
      1,
      { ...BODY, weightKg: 80, goal: "bulk" },
      "unless-manual",
      TODAY,
    );

    expect(await readProfile()).toMatchObject({
      weightKg: 80,
      kcalAdjustment: -200,
      proteinPerKg: 2,
      goal: "cut",
    });
    // Protein follows the new weight: 80 × 2.
    expect(await readTarget()).toMatchObject({ protein: 160 });
  });
});
