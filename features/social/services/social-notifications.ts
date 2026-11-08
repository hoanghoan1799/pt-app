import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  sql,
} from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { pushSubscriptions, socialNotifications } from "@/db/schema";
import {
  deliver,
  getVapid,
  type PushSender,
  sendWithWebPush,
} from "@/features/chat/services/chat-push";
import {
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATIONS_PAGE_SIZE,
} from "@/features/social/constants/social";
import {
  DELETED_ACCOUNT_NAME,
  loadAccounts,
} from "@/features/social/services/account-lookup";
import type {
  NotificationKind,
  NotificationView,
} from "@/features/social/types/social";
import {
  buildCommentPush,
  buildFriendPush,
  buildReactionPush,
  notificationHref,
  notificationText,
  shouldPushReaction,
} from "@/features/social/utils/engagement-rules";
import { logServerError } from "@/services/logger";

const DAY_MS = 24 * 60 * 60 * 1000;

export const countUnreadNotifications = async (recipientKey: string) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(socialNotifications)
    .where(
      and(
        eq(socialNotifications.recipientKey, recipientKey),
        isNull(socialNotifications.readAt),
      ),
    );

  return Number(row?.count ?? 0);
};

// Spec A4: rows older than 60 days go; called when the page loads.
export const purgeOldNotifications = async (now = new Date()) => {
  await db
    .delete(socialNotifications)
    .where(
      lt(
        socialNotifications.createdAt,
        new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS),
      ),
    );
};

export const markAllNotificationsRead = async (
  recipientKey: string,
  now = new Date(),
) => {
  await db
    .update(socialNotifications)
    .set({ readAt: now })
    .where(
      and(
        eq(socialNotifications.recipientKey, recipientKey),
        isNull(socialNotifications.readAt),
      ),
    );
};

// The latest 50 (spec A4), newest first. Read before marking them read, so
// the page can still show which ones were new.
export const listNotifications = async (
  recipientKey: string,
): Promise<NotificationView[]> => {
  const rows = await db
    .select()
    .from(socialNotifications)
    .where(eq(socialNotifications.recipientKey, recipientKey))
    .orderBy(desc(socialNotifications.createdAt), desc(socialNotifications.id))
    .limit(NOTIFICATIONS_PAGE_SIZE);
  const accounts = await loadAccounts(rows.map((row) => row.actorKey));

  return rows.map((row) => {
    const actor = accounts.get(row.actorKey);
    const actorName = actor?.name ?? DELETED_ACCOUNT_NAME;

    return {
      id: row.id,
      kind: row.kind,
      text: notificationText(row.kind, actorName),
      href: notificationHref(row.kind, recipientKey, row.postId),
      actorName,
      actorAvatarUrl: actor?.avatarUrl ?? null,
      createdAt: row.createdAt.getTime(),
      isUnread: row.readAt === null,
    };
  });
};

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

const reactionNotificationWhere = (input: {
  recipientKey: string;
  actorKey: string;
  postId: number;
}) =>
  and(
    eq(socialNotifications.kind, "post_reaction"),
    eq(socialNotifications.recipientKey, input.recipientKey),
    eq(socialNotifications.actorKey, input.actorKey),
    eq(socialNotifications.postId, input.postId),
  );

// Changing a reaction refreshes the same notification (new time, unread
// again) instead of adding another one.
export const upsertReactionNotification = async (
  input: { recipientKey: string; actorKey: string; postId: number },
  now = new Date(),
) => {
  const [existing] = await db
    .select({ id: socialNotifications.id })
    .from(socialNotifications)
    .where(reactionNotificationWhere(input))
    .limit(1);

  if (existing) {
    await db
      .update(socialNotifications)
      .set({ createdAt: now, readAt: null })
      .where(eq(socialNotifications.id, existing.id));
    return existing.id;
  }
  return createNotification({
    ...input,
    kind: "post_reaction",
    now,
  });
};

export const removeReactionNotification = async (input: {
  recipientKey: string;
  actorKey: string;
  postId: number;
}) => {
  await db.delete(socialNotifications).where(reactionNotificationWhere(input));
};

const buildPayload = (
  notification: typeof socialNotifications.$inferSelect,
  actorName: string,
  commentBody: string | undefined,
) => {
  if (
    notification.kind === "friend_request" ||
    notification.kind === "friend_accepted"
  ) {
    return buildFriendPush(notification.kind, actorName);
  }
  const postId = notification.postId ?? 0;

  return notification.kind === "post_comment"
    ? buildCommentPush(
        actorName,
        notification.recipientKey,
        postId,
        commentBody ?? "",
      )
    : buildReactionPush(actorName, notification.recipientKey, postId);
};

export interface SocialPushInput {
  notificationId: number;
  // Only a comment push carries text; it is never stored on the notification.
  commentBody?: string;
}

// Never throws. Comment pushes always go out; reaction pushes at most one per
// post per recipient per hour (pushed_at). Silently skipped without VAPID or
// without a subscription (spec A15).
export const sendSocialPush = async (
  { notificationId, commentBody }: SocialPushInput,
  sender: PushSender = sendWithWebPush,
  now = new Date(),
) => {
  try {
    const [notification] = await db
      .select()
      .from(socialNotifications)
      .where(eq(socialNotifications.id, notificationId))
      .limit(1);

    if (!notification) {
      return;
    }
    const isFriendEvent =
      notification.kind === "friend_request" ||
      notification.kind === "friend_accepted";

    // Post events need their post; friend events have none.
    if (!isFriendEvent && notification.postId === null) {
      return;
    }
    const vapid = getVapid();

    if (!vapid) {
      return;
    }
    if (notification.kind === "post_reaction" && notification.postId !== null) {
      const [last] = await db
        .select({ at: max(socialNotifications.pushedAt) })
        .from(socialNotifications)
        .where(
          and(
            eq(socialNotifications.recipientKey, notification.recipientKey),
            eq(socialNotifications.postId, notification.postId),
            eq(socialNotifications.kind, "post_reaction"),
            isNotNull(socialNotifications.pushedAt),
          ),
        );

      // max() of a timestamp_ms column comes back as a number.
      const lastAt = last?.at ? new Date(last.at) : null;

      if (!shouldPushReaction(lastAt, now)) {
        return;
      }
    }
    const targets = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ownerKey, notification.recipientKey));

    if (targets.length === 0) {
      return;
    }
    const actor = (await loadAccounts([notification.actorKey])).get(
      notification.actorKey,
    );
    const actorName = actor?.name ?? DELETED_ACCOUNT_NAME;
    const payload = buildPayload(notification, actorName, commentBody);

    await db
      .update(socialNotifications)
      .set({ pushedAt: now })
      .where(eq(socialNotifications.id, notification.id));
    await deliver(targets, payload, vapid, sender);
  } catch (error) {
    logServerError("sendSocialPush", error, { notificationId });
  }
};

// After the response when inside a request (Next's after()), otherwise
// fire-and-forget; never blocks or fails the action.
export const scheduleSocialPush = (input: SocialPushInput) => {
  try {
    after(() => sendSocialPush(input));
  } catch {
    void sendSocialPush(input);
  }
};
