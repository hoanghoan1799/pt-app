import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { loadAliases } from "@/features/contact-aliases/services/contact-aliases";
import {
  overlayName,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";
import type { PersonView } from "@/features/social/types/social";

// With `viewerId`, the names are that viewer's private nicknames where they
// set one (their own never); the real name otherwise.
export const loadPeople = async (
  ids: number[],
  viewerId?: number,
): Promise<Map<number, PersonView>> => {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .where(inArray(users.id, ids));
  const aliases =
    viewerId === undefined
      ? new Map<string, string>()
      : await loadAliases(
          userActorKey(viewerId),
          rows.map((row) => userActorKey(row.id)),
        );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name:
          row.id === viewerId
            ? row.name
            : overlayName(aliases, userActorKey(row.id), row.name),
        avatarUrl: avatarUrl("user", row.id, row.avatarUpdatedAt),
      },
    ]),
  );
};
