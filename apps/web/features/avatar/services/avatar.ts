import "server-only";

import { eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import {
  type AvatarKind,
  avatarUrl,
} from "@/features/avatar/utils/avatar-rules";

const table = (kind: AvatarKind) => (kind === "admin" ? admins : users);

// Timestamp columns hold whole seconds.
const nowInSeconds = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export interface StoredAvatar {
  avatar: string;
  updatedAt: Date;
}

// The image itself. Only the avatar route reads it, so the bulky column
// never rides along with sessions, chat payloads or lists.
export const getStoredAvatar = async (
  kind: AvatarKind,
  id: number,
): Promise<StoredAvatar | null> => {
  const target = table(kind);
  const [row] = await db
    .select({ avatar: target.avatar, updatedAt: target.avatarUpdatedAt })
    .from(target)
    .where(eq(target.id, id))
    .limit(1);

  return row?.avatar && row.updatedAt
    ? { avatar: row.avatar, updatedAt: row.updatedAt }
    : null;
};

// Callers validated the data URL (decodeAvatarDataUrl) first.
export const saveAvatar = async (
  kind: AvatarKind,
  id: number,
  dataUrl: string,
) => {
  const target = table(kind);
  const updatedAt = nowInSeconds();

  await db
    .update(target)
    .set({ avatar: dataUrl, avatarUpdatedAt: updatedAt })
    .where(eq(target.id, id));
  return avatarUrl(kind, id, updatedAt);
};

export const clearAvatar = async (kind: AvatarKind, id: number) => {
  const target = table(kind);

  await db
    .update(target)
    .set({ avatar: null, avatarUpdatedAt: null })
    .where(eq(target.id, id));
};

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
