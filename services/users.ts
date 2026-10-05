import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
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
