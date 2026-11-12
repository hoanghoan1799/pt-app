import "server-only";

import { toNameKey } from "@pt/contracts";
import { eq, getTableColumns } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { toEmailKey } from "@/utils/email";

// Every column except the profile photo (up to ~100 KB of base64): the session
// guard loads the user on each request and must not drag the image along. The
// photo is read on its own by /api/avatar.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { avatar: _avatar, ...userColumns } = getTableColumns(users);

export type UserRow = NonNullable<Awaited<ReturnType<typeof findUserById>>>;

// Same shape as a row, every column null: the trainee exists on the API but
// has no row in the legacy database (yet). Only for the auth guard, see
// services/auth-guard.ts; goes away with Drizzle.
export const emptyUserRow = (): UserRow =>
  Object.fromEntries(
    Object.keys(userColumns).map((column) => [column, null]),
  ) as unknown as UserRow;

export const findUserById = async (id: number) => {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
};

export const findUserByName = async (name: string) => {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(eq(users.nameKey, toNameKey(name)))
    .limit(1);

  return user ?? null;
};

export const findUserByEmail = async (email: string) => {
  const [user] = await db
    .select(userColumns)
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

export const setUserLocale = async (id: number, locale: string) => {
  await db.update(users).set({ locale }).where(eq(users.id, id));
};
