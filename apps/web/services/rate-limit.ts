import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  // Attempts left in the current window (0 once the limit is reached).
  remaining: number;
}

// Fixed-window counter on the rate_limits table, shared by all serverless
// instances. One atomic upsert: a new window starts when the previous one is
// older than `windowMs`, otherwise the count goes up by one. Every call counts,
// allowed or not, so call it only for an attempt that should be limited.
export const consumeRateLimit = async (
  key: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<RateLimitResult> => {
  const nowMs = now.getTime();
  const expired = sql`${rateLimits.windowStartedAt} <= ${nowMs - windowMs}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStartedAt: sql`case when ${expired} then ${nowMs} else ${rateLimits.windowStartedAt} end`,
      },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 1;

  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
};
