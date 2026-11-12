import "server-only";

import { addDays } from "@pt/contracts";
import { and, desc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { bodyProfiles, nutritionTargets, weightLogs } from "@/db/schema";
import { getBodyProfile } from "@/features/nutrition/services/body-profile-queries";
import { getLatestTarget } from "@/features/nutrition/services/nutrition-queries";
import type { BodyProfile } from "@/features/nutrition/types/nutrition";
import {
  calculateEnergyPlan,
  getBirthYear,
  getGoalFromAdjustment,
} from "@/features/nutrition/utils/energy";
import {
  getRecentWeekStarts,
  groupWeightsByWeek,
} from "@/features/nutrition/utils/weight";

type Body = Omit<
  BodyProfile,
  "birthYear" | "goal" | "kcalAdjustment" | "proteinPerKg"
> & { age: number };

// The admin sets the energy model (goal follows the kcal sign); a user's save
// leaves the stored energy model alone and only carries the legacy goal.
export type ProfileInput =
  | (Body & { kcalAdjustment: number; proteinPerKg: number })
  | (Body & { goal: BodyProfile["goal"] });

// "always": the admin asked for it; "unless-manual": a user edit or weigh-in,
// which must not replace a target the admin typed by hand.
type TargetUpdate = "always" | "never" | "unless-manual";

// Replaces today's target with the TDEE macros when allowed; returns whether
// it did.
const applyTdeeTarget = async (
  userId: number,
  profile: BodyProfile,
  targetUpdate: TargetUpdate,
  today: string,
) => {
  const latestTarget = await getLatestTarget(userId);
  const shouldUpdate =
    targetUpdate === "always" ||
    (targetUpdate === "unless-manual" && latestTarget?.source !== "manual");

  if (!shouldUpdate) {
    return false;
  }

  const { macros } = calculateEnergyPlan(profile, today);

  await db
    .insert(nutritionTargets)
    .values({
      userId,
      effectiveFrom: today,
      ...macros,
      note: latestTarget?.note ?? "",
      source: "tdee",
    })
    .onConflictDoUpdate({
      target: [nutritionTargets.userId, nutritionTargets.effectiveFrom],
      set: { ...macros, source: "tdee" },
    });
  return true;
};

const upsertWeightLog = (userId: number, date: string, weightKg: number) =>
  db
    .insert(weightLogs)
    .values({ userId, date, weightKg })
    .onConflictDoUpdate({
      target: [weightLogs.userId, weightLogs.date],
      set: { weightKg },
    });

// Saves the profile (and today's weigh-in) and maybe today's target; returns
// whether the target was recomputed. The admin sets the energy model; a
// member's save never writes kcal_adjustment or protein_per_kg, and only
// writes the legacy goal while the energy model is unset.
export const saveBodyProfile = async (
  userId: number,
  { age, ...input }: ProfileInput,
  targetUpdate: TargetUpdate,
  today: string,
) => {
  const birthYear = getBirthYear(age, today);
  const isAdmin = "kcalAdjustment" in input;
  const measurements = {
    sex: input.sex,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    activityLevel: input.activityLevel,
    birthYear,
  };
  const energy = isAdmin
    ? {
        kcalAdjustment: input.kcalAdjustment,
        proteinPerKg: input.proteinPerKg,
        goal: getGoalFromAdjustment(input.kcalAdjustment),
      }
    : { goal: input.goal };
  const [row] = await db
    .insert(bodyProfiles)
    .values({ userId, ...measurements, ...energy })
    .onConflictDoUpdate({
      target: bodyProfiles.userId,
      set: {
        ...measurements,
        ...(isAdmin
          ? energy
          : {
              // Keep the goal once the PT has set the energy model.
              goal: sql`case when ${bodyProfiles.kcalAdjustment} is null then ${energy.goal} else ${bodyProfiles.goal} end`,
            }),
        updatedAt: new Date(),
      },
    })
    .returning();

  await upsertWeightLog(userId, today, row.weightKg);

  return applyTdeeTarget(
    userId,
    {
      sex: row.sex,
      birthYear: row.birthYear,
      heightCm: row.heightCm,
      weightKg: row.weightKg,
      activityLevel: row.activityLevel,
      goal: row.goal,
      kcalAdjustment: row.kcalAdjustment,
      proteinPerKg: row.proteinPerKg,
    },
    targetUpdate,
    today,
  );
};

// Records a weigh-in. When it is the most recent one, the body profile takes
// the new weight and a TDEE-based target follows it.
export const logWeight = async (
  userId: number,
  date: string,
  weightKg: number,
  today: string,
) => {
  await upsertWeightLog(userId, date, weightKg);

  const [newer] = await db
    .select({ id: weightLogs.id })
    .from(weightLogs)
    .where(and(eq(weightLogs.userId, userId), gt(weightLogs.date, date)))
    .limit(1);
  const profile = await getBodyProfile(userId);

  if (newer || !profile) {
    return false;
  }

  await db
    .update(bodyProfiles)
    .set({ weightKg, updatedAt: new Date() })
    .where(eq(bodyProfiles.userId, userId));

  return applyTdeeTarget(
    userId,
    { ...profile, weightKg },
    "unless-manual",
    today,
  );
};

export const getWeightLogs = async (userId: number, from: string) =>
  db
    .select({ date: weightLogs.date, weightKg: weightLogs.weightKg })
    .from(weightLogs)
    .where(and(eq(weightLogs.userId, userId), gt(weightLogs.date, from)))
    .orderBy(desc(weightLogs.date));

// Weekly averages for the chart: the `weeks` weeks ending with `weekStart`.
export const getWeightTrend = async (
  userId: number,
  weekStart: string,
  weeks: number,
) => {
  const weekStarts = getRecentWeekStarts(weekStart, weeks);
  const logs = await getWeightLogs(userId, addDays(weekStarts[0], -1));

  return groupWeightsByWeek(logs, weekStarts);
};

export const getTodayWeight = async (userId: number, today: string) => {
  const [log] = await db
    .select({ weightKg: weightLogs.weightKg })
    .from(weightLogs)
    .where(and(eq(weightLogs.userId, userId), eq(weightLogs.date, today)))
    .limit(1);

  return log?.weightKg ?? null;
};
