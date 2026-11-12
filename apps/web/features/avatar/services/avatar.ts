import "server-only";

import { eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import {
  type AvatarKind,
  avatarUrl,
} from "@/features/avatar/utils/avatar-rules";

// READ side only, kept for the pages still on Drizzle (chat threads, bubbles).
// Saving, removing and serving photos goes through the API
// (avatar-actions.ts, app/api/avatar). Delete this file with the last of those
// pages: the API's chat and trainee payloads carry `avatarUrl` themselves.

const table = (kind: AvatarKind) => (kind === "admin" ? admins : users);

// Versioned URL of one person's photo, or null.
export const getAvatarUrl = async (kind: AvatarKind, id: number) => {
  const target = table(kind);
  const [row] = await db
    .select({ updatedAt: target.avatarUpdatedAt })
    .from(target)
    .where(eq(target.id, id))
    .limit(1);

  return avatarUrl(kind, id, row?.updatedAt);
};

// Versioned URLs of every PT who has a photo, keyed by admin id (the PT team
// is small).
export const listAdminAvatarUrls = async (): Promise<Map<number, string>> => {
  const rows = await db
    .select({ id: admins.id, updatedAt: admins.avatarUpdatedAt })
    .from(admins)
    .where(isNotNull(admins.avatar));
  const urls = new Map<number, string>();

  for (const row of rows) {
    const url = avatarUrl("admin", row.id, row.updatedAt);

    if (url) {
      urls.set(row.id, url);
    }
  }
  return urls;
};
