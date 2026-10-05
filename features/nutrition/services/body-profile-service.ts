import "server-only";

import { db } from "@/db";
import { bodyProfiles, nutritionTargets } from "@/db/schema";
import { getLatestTarget } from "@/features/nutrition/services/nutrition-queries";
import type { BodyProfile } from "@/features/nutrition/types/nutrition";
import {
  calculateEnergyPlan,
  getBirthYear,
} from "@/features/nutrition/utils/energy";

type Measurements = Omit<BodyProfile, "birthYear"> & { age: number };

// "always": the admin asked for it; "unless-manual": a user edit, which must
// not replace a target the admin typed by hand.
type TargetUpdate = "always" | "never" | "unless-manual";

// Saves the profile and maybe today's target; returns whether the target
// was recomputed.
export const saveBodyProfile = async (
  userId: number,
  { age, ...measurements }: Measurements,
  targetUpdate: TargetUpdate,
  today: string,
) => {
  const profile = { ...measurements, birthYear: getBirthYear(age, today) };

  await db
    .insert(bodyProfiles)
    .values({ userId, ...profile })
    .onConflictDoUpdate({
      target: bodyProfiles.userId,
      set: { ...profile, updatedAt: new Date() },
    });

  const latestTarget = await getLatestTarget(userId);
  const shouldUpdateTarget =
    targetUpdate === "always" ||
    (targetUpdate === "unless-manual" && latestTarget?.source !== "manual");

  if (!shouldUpdateTarget) {
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
