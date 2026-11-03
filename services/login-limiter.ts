import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { loginAttempts } from "@/db/schema";
import { isRecordLocked, nextFailureState } from "@/utils/login-limiter-rules";

export const userLimiterKey = (emailKey: string) => `user:${emailKey}`;
export const adminLimiterKey = (usernameKey: string) => `admin:${usernameKey}`;

const findRecord = async (key: string) => {
  const [record] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);

  return record ?? null;
};

export const isLocked = async (key: string) =>
  isRecordLocked(await findRecord(key), new Date());

export const recordFailure = async (key: string) => {
  const next = nextFailureState(await findRecord(key), new Date());

  await db
    .insert(loginAttempts)
    .values({ key, ...next })
    .onConflictDoUpdate({ target: loginAttempts.key, set: next });
};

export const clearAttempts = async (key: string) => {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
};
