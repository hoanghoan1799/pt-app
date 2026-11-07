import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { loginAttempts } from "@/db/schema";
import { isRecordLocked, nextFailureState } from "@/utils/login-limiter-rules";

export const userLimiterKey = (emailKey: string) => `user:${emailKey}`;
export const adminLimiterKey = (usernameKey: string) => `admin:${usernameKey}`;

// Wrong account password in "Quên mã khoá" (KAN-160).
export const passcodeResetLimiterKey = (adminId: number) =>
  `passcode-reset:${adminId}`;

// Wrong passcode typed to reveal hidden chats (KAN-163). Separate from the
// lock-screen counter, so it never signs the admin out.
export const passcodeRevealLimiterKey = (adminId: number) =>
  `passcode-reveal:${adminId}`;

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
