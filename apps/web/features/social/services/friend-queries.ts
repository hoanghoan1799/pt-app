import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { socialBlocks, socialFriendships, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { loadAliases } from "@/features/contact-aliases/services/contact-aliases";
import {
  overlayName,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";
import {
  getRelationship,
  isBlockedBetween,
  listBlockedBetweenIds,
} from "@/features/social/services/relationships";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import {
  parseSearchEmail,
  type Relationship,
} from "@/features/social/utils/friend-rules";

export interface PersonView {
  id: number;
  name: string;
  avatarUrl: string | null;
}

export interface SearchResult extends PersonView {
  relationship: Relationship;
}

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

const inOrder = (ids: number[], people: Map<number, PersonView>) =>
  ids.flatMap((id) => {
    const person = people.get(id);

    return person ? [person] : [];
  });

// Exact-email search (spec Q5): the whole address, trimmed and lower-cased,
// compared with users.email_key for equality. A prefix, a partial address or a
// different case of the domain never finds anyone else. Nothing for yourself,
// for a trainee without accepted terms, or for anyone blocked either way, so
// the answer is "not found" in all of those cases.
export const searchTraineeByEmail = async (
  meId: number,
  rawEmail: unknown,
): Promise<SearchResult | null> => {
  const emailKey = parseSearchEmail(rawEmail);

  if (emailKey === null) {
    return null;
  }
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUpdatedAt: users.avatarUpdatedAt,
      termsVersion: users.termsVersion,
    })
    .from(users)
    .where(eq(users.emailKey, emailKey))
    .limit(1);

  if (
    !row ||
    row.id === meId ||
    !hasAcceptedTerms(row) ||
    (await isBlockedBetween(meId, row.id))
  ) {
    return null;
  }
  return {
    id: row.id,
    name: (await loadPeople([row.id], meId)).get(row.id)?.name ?? row.name,
    avatarUrl: avatarUrl("user", row.id, row.avatarUpdatedAt),
    relationship: await getRelationship(meId, row.id),
  };
};

// Accepted friends, newest friendship first, minus anyone blocked.
export const listFriends = async (meId: number): Promise<PersonView[]> => {
  const [rows, blocked] = await Promise.all([
    db
      .select()
      .from(socialFriendships)
      .where(
        and(
          eq(socialFriendships.status, "accepted"),
          or(
            eq(socialFriendships.userLow, meId),
            eq(socialFriendships.userHigh, meId),
          ),
        ),
      )
      .orderBy(desc(socialFriendships.acceptedAt)),
    listBlockedBetweenIds(meId),
  ]);
  const ids = rows
    .map((row) => (row.userLow === meId ? row.userHigh : row.userLow))
    .filter((id) => !blocked.has(id));

  return inOrder(ids, await loadPeople(ids, meId));
};

export interface FriendRequests {
  received: PersonView[];
  sent: PersonView[];
}

export const listFriendRequests = async (
  meId: number,
): Promise<FriendRequests> => {
  const rows = await db
    .select()
    .from(socialFriendships)
    .where(
      and(
        eq(socialFriendships.status, "pending"),
        or(
          eq(socialFriendships.userLow, meId),
          eq(socialFriendships.userHigh, meId),
        ),
      ),
    )
    .orderBy(desc(socialFriendships.createdAt));
  const otherOf = (row: (typeof rows)[number]) =>
    row.userLow === meId ? row.userHigh : row.userLow;
  const people = await loadPeople(rows.map(otherOf), meId);

  return {
    received: inOrder(
      rows.filter((row) => row.requestedBy !== meId).map(otherOf),
      people,
    ),
    sent: inOrder(
      rows.filter((row) => row.requestedBy === meId).map(otherOf),
      people,
    ),
  };
};

// People I blocked (not the ones who blocked me).
export const listBlockedByMe = async (meId: number): Promise<PersonView[]> => {
  const rows = await db
    .select()
    .from(socialBlocks)
    .where(eq(socialBlocks.blockerId, meId))
    .orderBy(desc(socialBlocks.createdAt));
  const ids = rows.map((row) => row.blockedId);

  return inOrder(ids, await loadPeople(ids, meId));
};

export const countPendingReceived = async (meId: number) =>
  (await listFriendRequests(meId)).received.length;
