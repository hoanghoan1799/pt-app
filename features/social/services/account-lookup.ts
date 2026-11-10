import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { loadAliases } from "@/features/contact-aliases/services/contact-aliases";
import { overlayName } from "@/features/contact-aliases/utils/alias-rules";
import { parseActorKey } from "@/features/social/utils/engagement-rules";

export interface AccountInfo {
  // What the viewer sees: their private nickname for the account when
  // `viewerKey` was given and they set one, else the real name.
  name: string;
  // Always the account's real name (for "alias (real name)" displays).
  realName: string;
  avatarUrl: string | null;
  verified: boolean;
}

export const DELETED_ACCOUNT_NAME = "Đã xóa";

// Name, avatar and blue tick for "user:<id>" / "admin:<id>" keys. Keys of
// deleted accounts are simply missing from the map. With `viewerKey` (the
// signed-in account) the viewer's private nicknames replace the names; the
// viewer's own name is never replaced.
export const loadAccounts = async (
  keys: string[],
  viewerKey?: string,
): Promise<Map<string, AccountInfo>> => {
  const refs = [...new Set(keys)]
    .map((key) => ({ key, ref: parseActorKey(key) }))
    .filter((item) => item.ref !== null);
  const userIds = refs.filter((item) => item.ref?.kind === "user");
  const adminIds = refs.filter((item) => item.ref?.kind === "admin");
  const [userRows, adminRows] = await Promise.all([
    userIds.length
      ? db
          .select({
            id: users.id,
            name: users.name,
            avatarUpdatedAt: users.avatarUpdatedAt,
          })
          .from(users)
          .where(
            inArray(
              users.id,
              userIds.map((item) => item.ref?.id ?? 0),
            ),
          )
      : [],
    adminIds.length
      ? db
          .select({
            id: admins.id,
            name: admins.username,
            avatarUpdatedAt: admins.avatarUpdatedAt,
            verifiedAt: admins.verifiedAt,
          })
          .from(admins)
          .where(
            inArray(
              admins.id,
              adminIds.map((item) => item.ref?.id ?? 0),
            ),
          )
      : [],
  ]);
  const result = new Map<string, AccountInfo>();

  for (const row of userRows) {
    result.set(`user:${row.id}`, {
      name: row.name,
      realName: row.name,
      avatarUrl: avatarUrl("user", row.id, row.avatarUpdatedAt),
      verified: false,
    });
  }
  for (const row of adminRows) {
    result.set(`admin:${row.id}`, {
      name: row.name,
      realName: row.name,
      avatarUrl: avatarUrl("admin", row.id, row.avatarUpdatedAt),
      verified: Boolean(row.verifiedAt),
    });
  }
  if (viewerKey && result.size > 0) {
    const aliases = await loadAliases(viewerKey, [...result.keys()]);

    for (const [key, account] of result) {
      if (key !== viewerKey) {
        result.set(key, {
          ...account,
          name: overlayName(aliases, key, account.name),
        });
      }
    }
  }
  return result;
};
