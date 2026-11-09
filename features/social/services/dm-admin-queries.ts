import "server-only";

import { desc, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { dmConversations, dmMessages, users } from "@/db/schema";
import { dmPreview } from "@/features/social/utils/dm-rules";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// Read-only views for the super admin (Q6). Callers must have passed
// requireSuperAdmin; nothing here checks the role.

export interface AdminDmRow {
  id: number;
  lowName: string;
  highName: string;
  lastMessageAt: Date | null;
  preview: string;
}

export const listAllDmConversations = async (
  locale: Locale = DEFAULT_LOCALE,
): Promise<AdminDmRow[]> => {
  const rows = await db
    .select()
    .from(dmConversations)
    .orderBy(
      desc(sql`coalesce(${dmConversations.lastMessageAt}, 0)`),
      desc(dmConversations.id),
    );

  if (rows.length === 0) {
    return [];
  }
  const memberIds = [...new Set(rows.flatMap((r) => [r.userLow, r.userHigh]))];
  const lastIds = rows.flatMap((r) =>
    r.lastMessageId === null ? [] : [r.lastMessageId],
  );
  const [people, lasts] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, memberIds)),
    lastIds.length === 0
      ? Promise.resolve([])
      : db.select().from(dmMessages).where(inArray(dmMessages.id, lastIds)),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const lastById = new Map(lasts.map((m) => [m.id, m]));

  return rows.map((row) => {
    const last =
      row.lastMessageId === null ? undefined : lastById.get(row.lastMessageId);

    return {
      id: row.id,
      lowName: names.get(row.userLow) ?? "Đã xoá",
      highName: names.get(row.userHigh) ?? "Đã xoá",
      lastMessageAt: row.lastMessageAt,
      preview: last
        ? dmPreview(
            {
              body: last.body,
              photoId: last.photoId,
              deleted: last.deletedAt !== null,
            },
            locale,
          )
        : "",
    };
  });
};

export const loadDmMemberNames = async (low: number, high: number) => {
  const people = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [low, high]));

  return new Map(people.map((p) => [p.id, p.name]));
};
