import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { TERMS_VERSION } from "@/features/social/constants/social";

// A trainee may use the social features once they accepted the current terms
// version (a new version asks again, spec T1).
export const hasAcceptedTerms = (user: { termsVersion: number | null }) =>
  user.termsVersion !== null && user.termsVersion >= TERMS_VERSION;

export const acceptTerms = async (userId: number, now = new Date()) => {
  const rows = await db
    .update(users)
    .set({ termsVersion: TERMS_VERSION, termsAcceptedAt: now })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  return rows.length > 0;
};
