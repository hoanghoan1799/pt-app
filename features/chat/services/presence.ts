import "server-only";

import { and, eq, isNull, lte, max, or } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import { PRESENCE_HEARTBEAT_MS } from "@/features/chat/utils/presence";

// Timestamp columns hold whole seconds.
const toSeconds = (ms: number) => new Date(Math.floor(ms / 1000) * 1000);

// One conditional UPDATE each: writes only when never seen or the last beat is
// at least a minute old, so a busy tab costs at most one write a minute.
export const touchUserPresence = async (userId: number, now = new Date()) => {
  await db
    .update(users)
    .set({ lastSeenAt: toSeconds(now.getTime()) })
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(users.lastSeenAt),
          lte(
            users.lastSeenAt,
            toSeconds(now.getTime() - PRESENCE_HEARTBEAT_MS),
          ),
        ),
      ),
    );
};

export const touchAdminPresence = async (adminId: number, now = new Date()) => {
  await db
    .update(admins)
    .set({ lastSeenAt: toSeconds(now.getTime()) })
    .where(
      and(
        eq(admins.id, adminId),
        or(
          isNull(admins.lastSeenAt),
          lte(
            admins.lastSeenAt,
            toSeconds(now.getTime() - PRESENCE_HEARTBEAT_MS),
          ),
        ),
      ),
    );
};

// Newest heartbeat across all PTs (shared inbox): online if any admin is.
export const getAdminTeamLastSeen = async (): Promise<Date | null> => {
  const [row] = await db
    .select({ lastSeenAt: max(admins.lastSeenAt) })
    .from(admins);

  // max() over a timestamp column comes back as raw seconds.
  const value = row?.lastSeenAt as unknown;

  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value : new Date(Number(value) * 1000);
};

export const getUserLastSeen = async (userId: number): Promise<Date | null> => {
  const [row] = await db
    .select({ lastSeenAt: users.lastSeenAt })
    .from(users)
    .where(eq(users.id, userId));

  return row?.lastSeenAt ?? null;
};
