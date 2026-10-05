import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { admins } from "@/db/schema";
import { toUsernameKey } from "@/utils/username";

export const findAdminById = async (id: number) => {
  const [admin] = await db
    .select({ id: admins.id, username: admins.username })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  return admin ?? null;
};

export const findAdminByUsername = async (username: string) => {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.usernameKey, toUsernameKey(username)))
    .limit(1);

  return admin ?? null;
};
