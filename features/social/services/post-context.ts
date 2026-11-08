import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import type {
  PostAuthorRef,
  SocialActor,
} from "@/features/social/types/social";
import type { VisibilityContext } from "@/features/social/utils/visibility";
import { toAdminRole } from "@/services/admin-scope";

export const actorOfUser = (user: { id: number }): SocialActor => ({
  kind: "user",
  id: user.id,
});

export const actorOfAdmin = (admin: {
  id: number;
  role: "super_admin" | "pt";
}): SocialActor => ({ kind: "admin", id: admin.id, role: admin.role });

// What canSeePost needs from the database about viewer and author. Friendship
// and block data join here in P4.
export const loadVisibilityContext = async (
  viewer: SocialActor,
  author: PostAuthorRef,
): Promise<VisibilityContext> => {
  const ctx: VisibilityContext = { areFriends: false, isBlocked: false };

  if (author.kind === "user") {
    const [row] = await db
      .select({ ptAdminId: users.ptAdminId })
      .from(users)
      .where(eq(users.id, author.id))
      .limit(1);

    ctx.authorPtAdminId = row?.ptAdminId ?? null;
  } else {
    const [row] = await db
      .select({ role: admins.role })
      .from(admins)
      .where(eq(admins.id, author.id))
      .limit(1);

    ctx.authorRole = toAdminRole(row?.role);
  }
  if (viewer.kind === "user") {
    const [row] = await db
      .select({ ptAdminId: users.ptAdminId })
      .from(users)
      .where(eq(users.id, viewer.id))
      .limit(1);

    ctx.viewerPtAdminId = row?.ptAdminId ?? null;
  }
  return ctx;
};
