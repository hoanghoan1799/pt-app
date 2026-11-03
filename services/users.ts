import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { toEmailKey } from "@/utils/email";
import { toNameKey } from "@/utils/name";

export const findUserById = async (id: number) => {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return user ?? null;
};

export const findUserByName = async (name: string) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.nameKey, toNameKey(name)))
    .limit(1);

  return user ?? null;
};

export const findUserByEmail = async (email: string) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.emailKey, toEmailKey(email)))
    .limit(1);

  return user ?? null;
};

// Whole seconds, so it compares cleanly with a session's `iat`.
const nowInSeconds = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export const setUserPassword = async (userId: number, passwordHash: string) => {
  await db
    .update(users)
    .set({ passwordHash, passwordChangedAt: nowInSeconds() })
    .where(eq(users.id, userId));
};

// Email only: the password and open sessions stay as they are.
export const setUserEmail = async (userId: number, email: string) => {
  const trimmed = email.trim();

  await db
    .update(users)
    .set({ email: trimmed, emailKey: toEmailKey(trimmed) })
    .where(eq(users.id, userId));
};
