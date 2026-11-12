import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { socialNotifications } from "@/db/schema";
import type { NotificationKind } from "@/features/social/types/social";

// Rows of the legacy notification table. Reading, marking read and pushing
// moved to the API (/v1/social/notifications); these writes stay only for the
// friend / reaction mutations that member deletion and the DM tests still use.

// A new notification row. Reactions use `upsertReactionNotification`.
export const createNotification = async (input: {
  recipientKey: string;
  kind: NotificationKind;
  actorKey: string;
  postId: number | null;
  now?: Date;
}) => {
  const [row] = await db
    .insert(socialNotifications)
    .values({
      recipientKey: input.recipientKey,
      kind: input.kind,
      actorKey: input.actorKey,
      postId: input.postId,
      createdAt: input.now ?? new Date(),
    })
    .returning({ id: socialNotifications.id });

  return row.id;
};

// Friend request / accepted notifications have no post. A repeated one (the
// request was declined and sent again) replaces the earlier row.
export const createFriendNotification = async (input: {
  recipientKey: string;
  actorKey: string;
  kind: "friend_request" | "friend_accepted";
  now?: Date;
}) => {
  await removeFriendNotifications(input.recipientKey, input.actorKey, [
    input.kind,
  ]);
  return createNotification({ ...input, postId: null });
};

export const removeFriendNotifications = async (
  recipientKey: string,
  actorKey: string,
  kinds: ("friend_request" | "friend_accepted")[] = [
    "friend_request",
    "friend_accepted",
  ],
) => {
  await db
    .delete(socialNotifications)
    .where(
      and(
        eq(socialNotifications.recipientKey, recipientKey),
        eq(socialNotifications.actorKey, actorKey),
        inArray(socialNotifications.kind, kinds),
      ),
    );
};
