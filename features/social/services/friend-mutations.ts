import "server-only";

import { and, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { socialBlocks, socialFriendships, users } from "@/db/schema";
import {
  FRIEND_REQUEST_WINDOW_MS,
  FRIEND_REQUESTS_PER_DAY,
} from "@/features/social/constants/social";
import {
  findFriendship,
  isBlockedBetween,
} from "@/features/social/services/relationships";
import {
  createFriendNotification,
  removeFriendNotifications,
} from "@/features/social/services/social-notifications";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { pairOf } from "@/features/social/utils/friend-rules";
import { consumeRateLimit } from "@/services/rate-limit";

export type FriendError =
  "not_found" | "already_friends" | "already_requested" | "rate_limited";

type Outcome<T = object> =
  ({ ok: true } & T) | { ok: false; error: FriendError };

const failure = (error: FriendError) => ({ ok: false as const, error });

const userKey = (id: number) => `user:${id}`;

// A trainee the viewer may befriend: exists, accepted the terms, is not the
// viewer and no block in either direction.
const findRequestable = async (meId: number, targetId: number) => {
  if (meId === targetId) {
    return null;
  }
  const [target] = await db
    .select({ id: users.id, termsVersion: users.termsVersion })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target || !hasAcceptedTerms(target)) {
    return null;
  }
  return (await isBlockedBetween(meId, targetId)) ? null : target;
};

// `notificationId` is the row to push for; `accepted` is true when the other
// side had already asked me, so the request became a friendship at once.
export const sendFriendRequest = async (
  meId: number,
  targetId: number,
  now = new Date(),
): Promise<Outcome<{ accepted: boolean; notificationId: number }>> => {
  if (!(await findRequestable(meId, targetId))) {
    return failure("not_found");
  }
  const existing = await findFriendship(meId, targetId);

  if (existing?.status === "accepted") {
    return failure("already_friends");
  }
  if (existing && existing.requestedBy === meId) {
    return failure("already_requested");
  }
  if (existing) {
    // They asked me first: asking back is accepting.
    const accepted = await acceptFriendRequest(meId, targetId, now);

    return accepted.ok
      ? { ok: true, accepted: true, notificationId: accepted.notificationId }
      : accepted;
  }
  const limit = await consumeRateLimit(
    `friend-request:${meId}`,
    FRIEND_REQUESTS_PER_DAY,
    FRIEND_REQUEST_WINDOW_MS,
    now,
  );

  if (!limit.allowed) {
    return failure("rate_limited");
  }
  const { low, high } = pairOf(meId, targetId);

  await db.insert(socialFriendships).values({
    userLow: low,
    userHigh: high,
    status: "pending",
    requestedBy: meId,
    createdAt: now,
  });
  const notificationId = await createFriendNotification({
    recipientKey: userKey(targetId),
    actorKey: userKey(meId),
    kind: "friend_request",
    now,
  });

  return { ok: true, accepted: false, notificationId };
};

// Only the one who was asked accepts.
export const acceptFriendRequest = async (
  meId: number,
  requesterId: number,
  now = new Date(),
): Promise<Outcome<{ notificationId: number }>> => {
  const { low, high } = pairOf(meId, requesterId);
  const rows = await db
    .update(socialFriendships)
    .set({ status: "accepted", acceptedAt: now })
    .where(
      and(
        eq(socialFriendships.userLow, low),
        eq(socialFriendships.userHigh, high),
        eq(socialFriendships.status, "pending"),
        eq(socialFriendships.requestedBy, requesterId),
      ),
    )
    .returning({ low: socialFriendships.userLow });

  if (rows.length === 0 || (await isBlockedBetween(meId, requesterId))) {
    return failure("not_found");
  }
  // The request is answered: drop it from my list, tell the requester.
  await removeFriendNotifications(userKey(meId), userKey(requesterId));
  const notificationId = await createFriendNotification({
    recipientKey: userKey(requesterId),
    actorKey: userKey(meId),
    kind: "friend_accepted",
    now,
  });

  return { ok: true, notificationId };
};

const deletePending = async (
  requesterId: number,
  otherId: number,
): Promise<boolean> => {
  const { low, high } = pairOf(requesterId, otherId);
  const rows = await db
    .delete(socialFriendships)
    .where(
      and(
        eq(socialFriendships.userLow, low),
        eq(socialFriendships.userHigh, high),
        eq(socialFriendships.status, "pending"),
        eq(socialFriendships.requestedBy, requesterId),
      ),
    )
    .returning({ low: socialFriendships.userLow });

  return rows.length > 0;
};

// The one who was asked says no; the row goes, so a new request is possible.
export const declineFriendRequest = async (
  meId: number,
  requesterId: number,
): Promise<Outcome> => {
  if (!(await deletePending(requesterId, meId))) {
    return failure("not_found");
  }
  await removeFriendNotifications(userKey(meId), userKey(requesterId), [
    "friend_request",
  ]);
  return { ok: true };
};

// The one who asked takes the request back.
export const cancelFriendRequest = async (
  meId: number,
  targetId: number,
): Promise<Outcome> => {
  if (!(await deletePending(meId, targetId))) {
    return failure("not_found");
  }
  await removeFriendNotifications(userKey(targetId), userKey(meId), [
    "friend_request",
  ]);
  return { ok: true };
};

export const unfriend = async (
  meId: number,
  otherId: number,
): Promise<Outcome> => {
  const { low, high } = pairOf(meId, otherId);
  const rows = await db
    .delete(socialFriendships)
    .where(
      and(
        eq(socialFriendships.userLow, low),
        eq(socialFriendships.userHigh, high),
        eq(socialFriendships.status, "accepted"),
      ),
    )
    .returning({ low: socialFriendships.userLow });

  return rows.length > 0 ? { ok: true } : failure("not_found");
};

// Blocking ends any friendship or pending request, and clears the friend
// notifications between the two (spec M1). Blocking twice is fine.
export const blockUser = async (
  meId: number,
  targetId: number,
  now = new Date(),
): Promise<Outcome> => {
  if (meId === targetId) {
    return failure("not_found");
  }
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target) {
    return failure("not_found");
  }
  const { low, high } = pairOf(meId, targetId);

  await db.transaction(async (tx) => {
    await tx
      .insert(socialBlocks)
      .values({ blockerId: meId, blockedId: targetId, createdAt: now })
      .onConflictDoNothing();
    await tx
      .delete(socialFriendships)
      .where(
        and(
          eq(socialFriendships.userLow, low),
          eq(socialFriendships.userHigh, high),
        ),
      );
  });
  await removeFriendNotifications(userKey(meId), userKey(targetId));
  await removeFriendNotifications(userKey(targetId), userKey(meId));
  return { ok: true };
};

// Only the blocker lifts a block; friendship does not come back.
export const unblockUser = async (
  meId: number,
  targetId: number,
): Promise<Outcome> => {
  const rows = await db
    .delete(socialBlocks)
    .where(
      and(
        eq(socialBlocks.blockerId, meId),
        eq(socialBlocks.blockedId, targetId),
      ),
    )
    .returning({ blocker: socialBlocks.blockerId });

  return rows.length > 0 ? { ok: true } : failure("not_found");
};

// Used by the member delete: every friendship and block of one trainee.
export const deleteFriendDataOfUser = async (
  executor: Pick<typeof db, "delete">,
  userId: number,
) => {
  await executor
    .delete(socialFriendships)
    .where(
      or(
        eq(socialFriendships.userLow, userId),
        eq(socialFriendships.userHigh, userId),
      ),
    );
  await executor
    .delete(socialBlocks)
    .where(
      or(
        eq(socialBlocks.blockerId, userId),
        eq(socialBlocks.blockedId, userId),
      ),
    );
};
