import "server-only";

import { and, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { socialNotifications, users } from "@/db/schema";
import { scheduleSocialPush } from "@/features/social/services/social-notifications";
import type { PostPrivacy, SocialActor } from "@/features/social/types/social";
import { shouldNotifyAdminPost } from "@/features/social/utils/admin-post-rules";
import { canSeeHiddenUsers } from "@/services/admin-lock";
import { hiddenUserIdsOf } from "@/services/hidden-users";
import { logServerError } from "@/services/logger";

const INSERT_CHUNK = 100;

// Trainees an admin's new post reaches: a super admin reaches every trainee,
// a PT their own (users.pt_admin_id). Trainees the admin hid are left out
// unless they revealed hidden trainees (same rule as canAdminAccessUser).
export const listAdminPostRecipientIds = async (
  actor: Extract<SocialActor, { kind: "admin" }>,
  includeHidden: boolean,
) => {
  const conditions = [];

  if (actor.role === "pt") {
    conditions.push(eq(users.ptAdminId, actor.id));
  }
  if (!includeHidden) {
    conditions.push(notInArray(users.id, hiddenUserIdsOf(actor.id)));
  }
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions));

  return rows.map((row) => row.id);
};

// One admin_post notification per recipient, in batched inserts. Returns the
// new notification ids (empty for a post nobody is told about).
export const createAdminPostNotifications = async (
  actor: SocialActor,
  post: { postId: number; privacy: PostPrivacy },
  options: { includeHidden: boolean; now?: Date },
): Promise<number[]> => {
  if (actor.kind !== "admin" || !shouldNotifyAdminPost(post.privacy)) {
    return [];
  }
  const recipients = await listAdminPostRecipientIds(
    actor,
    options.includeHidden,
  );
  const createdAt = options.now ?? new Date();
  const ids: number[] = [];

  for (let start = 0; start < recipients.length; start += INSERT_CHUNK) {
    const rows = await db
      .insert(socialNotifications)
      .values(
        recipients.slice(start, start + INSERT_CHUNK).map((userId) => ({
          recipientKey: `user:${userId}`,
          kind: "admin_post" as const,
          actorKey: `admin:${actor.id}`,
          postId: post.postId,
          createdAt,
        })),
      )
      .returning({ id: socialNotifications.id });

    ids.push(...rows.map((row) => row.id));
  }
  return ids;
};

// Never throws: a failed notification must not fail the post.
export const notifyAdminPost = async (
  actor: SocialActor,
  post: { postId: number; privacy: PostPrivacy },
  now?: Date,
) => {
  try {
    const ids = await createAdminPostNotifications(actor, post, {
      includeHidden:
        actor.kind === "admin" && (await canSeeHiddenUsers(actor.id)),
      now,
    });

    for (const notificationId of ids) {
      scheduleSocialPush({ notificationId });
    }
    return ids;
  } catch (error) {
    logServerError("notifyAdminPost", error, { postId: post.postId });
    return [];
  }
};
