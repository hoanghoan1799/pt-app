import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import type { AuthorKind } from "@/features/social/types/social";

export interface ProfileData {
  kind: AuthorKind;
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string;
}

// Public profile card data; null when the account does not exist.
export const getProfile = async (
  kind: AuthorKind,
  id: number,
): Promise<ProfileData | null> => {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  if (kind === "user") {
    const [row] = await db
      .select({
        name: users.name,
        bio: users.bio,
        avatarUpdatedAt: users.avatarUpdatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return row
      ? {
          kind,
          id,
          name: row.name,
          avatarUrl: avatarUrl("user", id, row.avatarUpdatedAt),
          verified: false,
          bio: row.bio ?? "",
        }
      : null;
  }
  const [row] = await db
    .select({
      name: admins.username,
      bio: admins.bio,
      avatarUpdatedAt: admins.avatarUpdatedAt,
      verifiedAt: admins.verifiedAt,
    })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  return row
    ? {
        kind,
        id,
        name: row.name,
        avatarUrl: avatarUrl("admin", id, row.avatarUpdatedAt),
        verified: row.verifiedAt !== null,
        bio: row.bio ?? "",
      }
    : null;
};

// The privacy a trainee's composer starts with.
export const getPostPrivacyDefault = async (userId: number) => {
  const [row] = await db
    .select({ privacy: users.postPrivacyDefault })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.privacy ?? "friends";
};
