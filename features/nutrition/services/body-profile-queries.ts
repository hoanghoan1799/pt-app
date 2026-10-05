import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { bodyProfiles } from "@/db/schema";
import type { BodyProfile } from "@/features/nutrition/types/nutrition";

export const getBodyProfile = async (
  userId: number,
): Promise<BodyProfile | null> => {
  const [row] = await db
    .select()
    .from(bodyProfiles)
    .where(eq(bodyProfiles.userId, userId))
    .limit(1);

  return row
    ? {
        sex: row.sex,
        birthYear: row.birthYear,
        heightCm: row.heightCm,
        weightKg: row.weightKg,
        activityLevel: row.activityLevel,
        goal: row.goal,
      }
    : null;
};
