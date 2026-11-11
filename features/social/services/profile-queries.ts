import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { loadAliases } from "@/features/contact-aliases/services/contact-aliases";
import type { AuthorKind } from "@/features/social/types/social";
import { actorKey } from "@/features/social/utils/post-rules";
import { toAdminRole } from "@/services/admin-scope";

export interface ProfileData {
  kind: AuthorKind;
  id: number;
  // The viewer's private nickname for this person when they set one, else
  // the real name.
  name: string;
  // Always the real name; the profile page shows it next to a nickname.
  realName: string;
  // The nickname alone ("" when none), for the editor.
  alias: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string;
  // Trainee, or the admin's actual role (null in the table = super admin).
  role: "trainee" | "pt" | "super_admin";
}

// Public profile card data; null when the account does not exist. `viewerKey`
// is the signed-in account: its private nickname for this person replaces the
// name (never for the viewer's own profile).
export const getProfile = async (
  kind: AuthorKind,
  id: number,
  viewerKey?: string,
): Promise<ProfileData | null> => {
  const profile = await loadProfile(kind, id);

  if (!profile || !viewerKey || viewerKey === actorKey(profile)) {
    return profile;
  }
  const alias =
    (await loadAliases(viewerKey, [actorKey(profile)]))
      .get(actorKey(profile))
      ?.trim() ?? "";

  return alias ? { ...profile, name: alias, alias } : profile;
};

const loadProfile = async (
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
          realName: row.name,
          alias: "",
          avatarUrl: avatarUrl("user", id, row.avatarUpdatedAt),
          verified: false,
          bio: row.bio ?? "",
          role: "trainee",
        }
      : null;
  }
  const [row] = await db
    .select({
      name: admins.username,
      bio: admins.bio,
      avatarUpdatedAt: admins.avatarUpdatedAt,
      verifiedAt: admins.verifiedAt,
      role: admins.role,
    })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  return row
    ? {
        kind,
        id,
        name: row.name,
        realName: row.name,
        alias: "",
        avatarUrl: avatarUrl("admin", id, row.avatarUpdatedAt),
        verified: row.verifiedAt !== null,
        bio: row.bio ?? "",
        role: toAdminRole(row.role),
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
