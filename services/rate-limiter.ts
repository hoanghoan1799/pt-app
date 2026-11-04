import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { isOverLimit, nextWindowState } from "@/utils/rate-limit-rules";

// Counts one call against `key` in a fixed window stored in rate_limits
// (shared by all serverless instances). A rejected call is NOT written, so
// the stored count never goes past `max` and a blocked sender is free again
// as soon as the window ends. Read-then-upsert is not atomic: two parallel
// calls can both pass at the edge, which is fine for abuse protection.
export const consumeRateLimit = async (
  key: string,
  max: number,
  windowMs: number,
) => {
  const [record] = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .limit(1);
  const next = nextWindowState(record, new Date(), windowMs);

  if (isOverLimit(next.count, max)) {
    return { allowed: false };
  }
  await db
    .insert(rateLimits)
    .values({ key, ...next })
    .onConflictDoUpdate({ target: rateLimits.key, set: next });
  return { allowed: true };
};
