import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { parseActorKey } from "@/features/social/utils/engagement-rules";

export interface AccountInfo {
  name: string;
  avatarUrl: string | null;
  verified: boolean;
}

export const DELETED_ACCOUNT_NAME = "Đã xóa";

// Name, avatar and blue tick for "user:<id>" / "admin:<id>" keys. Keys of
// deleted accounts are simply missing from the map.
export const loadAccounts = async (
  keys: string[],
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
      avatarUrl: avatarUrl("user", row.id, row.avatarUpdatedAt),
      verified: false,
    });
  }
  for (const row of adminRows) {
    result.set(`admin:${row.id}`, {
      name: row.name,
      avatarUrl: avatarUrl("admin", row.id, row.avatarUpdatedAt),
      verified: Boolean(row.verifiedAt),
    });
  }
  return result;
};
