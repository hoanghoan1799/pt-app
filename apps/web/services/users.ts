import "server-only";

import { eq, getTableColumns } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

// Legacy row lookup, kept only for the areas still on Drizzle (chat, social,
// nutrition, workouts). Sign-in, the profile and every account setting go
// through the API now; delete this file with the last of those callers.

// Every column except the profile photo (up to ~100 KB of base64).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { avatar: _avatar, ...userColumns } = getTableColumns(users);

export type UserRow = NonNullable<Awaited<ReturnType<typeof findUserById>>>;

export const findUserById = async (id: number) => {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
};
