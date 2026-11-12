import "server-only";

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { isUserInAdminScope } from "@/services/admin-scope";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";

const userExists = async (userId: number) => {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return Boolean(row);
};

// Signed-in, unlocked admin who may work with this trainee: a PT only for the
// trainees of their workspace, a super admin for all; a trainee the admin hid
// counts as missing until revealed. Anyone else gets notFound(), same as the
// admin pages. Use it in every admin action that takes a userId, or first
// resolve the userId that owns the row being changed.
export const requireAdminForUser = async (
  userId: number,
  // Hide / unhide: the hidden state itself is the point, only scope applies.
  options: { ignoreHidden?: boolean } = {},
) => {
  const admin = await requireAdmin();
  const allowed =
    Number.isInteger(userId) &&
    (options.ignoreHidden
      ? await isUserInAdminScope(admin.id, userId)
      : await canAdminAccessUser(admin.id, userId));

  // A trainee that does not exist has nothing to protect: the caller answers
  // with its own "not found" message.
  return allowed || !(await userExists(userId)) ? admin : notFound();
};
