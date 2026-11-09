import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  dmConversations,
  dmMessages,
  dmPhotos,
  dmReads,
  users,
} from "@/db/schema";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import {
  type DmView,
  findDmConversation,
  resolveDmView,
} from "@/features/social/services/dm-access";
import { isDmPhotoAttachable } from "@/features/social/services/dm-photos";
import { getDmMessageView } from "@/features/social/services/dm-queries";
import { loadVisiblePost } from "@/features/social/services/post-access";
import { isBlockedBetween } from "@/features/social/services/relationships";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import type { DmMessageView } from "@/features/social/types/dm";
import type { SocialActor } from "@/features/social/types/social";
import { checkDmContent } from "@/features/social/utils/dm-rules";
import { pairOf } from "@/features/social/utils/friend-rules";

export type DmError =
  | "not_found"
  | "read_only"
  | "disabled"
  | "empty"
  | "too_long"
  | "photo_not_found"
  | "post_not_found";

type Result<T> =
  ({ ok: true } & T) | { ok: false; error: DmError; message?: string };

// Owner decision 2026-11-09: trainees no longer chat with each other, so a
// conversation is never created. An existing one stays reachable (read-only
// history) unless one side blocked the other.
export const getOrCreateDmConversation = async (
  meId: number,
  otherId: number,
): Promise<Result<{ conversationId: number }>> => {
  if (meId === otherId) {
    return { ok: false, error: "not_found" };
  }
  const { low, high } = pairOf(meId, otherId);
  const [me] = await db
    .select({ id: users.id, termsVersion: users.termsVersion })
    .from(users)
    .where(eq(users.id, meId))
    .limit(1);

  if (!me || !hasAcceptedTerms(me)) {
    return { ok: false, error: "not_found" };
  }
  if (await isBlockedBetween(meId, otherId)) {
    return { ok: false, error: "not_found" };
  }
  const [existing] = await db
    .select({ id: dmConversations.id })
    .from(dmConversations)
    .where(
      and(eq(dmConversations.userLow, low), eq(dmConversations.userHigh, high)),
    )
    .limit(1);

  return existing
    ? { ok: true, conversationId: existing.id }
    : { ok: false, error: "disabled", message: DM_MESSAGES.DISABLED };
};

export interface SendDmInput {
  conversationId: number;
  senderId: number;
  clientId: string;
  body: string;
  photoId: number | null;
  // The post this message replies to; needs a text.
  postId?: number | null;
}

export type SendDmResult = Result<{
  message: DmMessageView;
  // False when the clientId was already stored (a retried send).
  created: boolean;
  recipientId: number;
}>;

// Idempotent by (conversation, clientId): a retry returns the stored message
// and does not notify again.
export const sendDmMessage = async (
  input: SendDmInput,
  now = new Date(),
): Promise<SendDmResult> => {
  const sender: SocialActor = { kind: "user", id: input.senderId };
  const view = await resolveDmView(input.conversationId, sender);

  if (!view || view.access !== "member" || view.otherId === null) {
    return { ok: false, error: "not_found" };
  }
  const recipientId = view.otherId;
  const existing = await findByClientId(input.conversationId, input.clientId);

  if (existing && existing.senderId === input.senderId) {
    return {
      ok: true,
      created: false,
      recipientId,
      message: (await getDmMessageView(existing.id, sender)) as DmMessageView,
    };
  }
  if (view.readOnlyReason !== null) {
    return { ok: false, error: "read_only", message: view.readOnlyReason };
  }
  const content = checkDmContent(input.body, input.photoId);

  if (!content.ok) {
    return {
      ok: false,
      error: input.body.trim() === "" ? "empty" : "too_long",
      message: content.message,
    };
  }
  const postId = input.postId ?? null;

  if (postId !== null) {
    if (content.body === null) {
      return { ok: false, error: "empty", message: DM_MESSAGES.EMPTY };
    }
    // Only a post the sender can see and the other member wrote.
    const post = await loadVisiblePost(sender, postId);

    if (!post || post.authorKind !== "user" || post.authorId !== recipientId) {
      return {
        ok: false,
        error: "post_not_found",
        message: DM_MESSAGES.POST_NOT_FOUND,
      };
    }
  }
  if (
    input.photoId !== null &&
    !(await isDmPhotoAttachable(
      input.photoId,
      input.conversationId,
      input.senderId,
    ))
  ) {
    return { ok: false, error: "photo_not_found" };
  }
  const [row] = await db
    .insert(dmMessages)
    .values({
      conversationId: input.conversationId,
      senderId: input.senderId,
      body: content.body,
      photoId: input.photoId,
      replyPostId: postId,
      clientId: input.clientId,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    // Lost a race with the same clientId: the other insert wins.
    const winner = await findByClientId(input.conversationId, input.clientId);

    return winner && winner.senderId === input.senderId
      ? {
          ok: true,
          created: false,
          recipientId,
          message: (await getDmMessageView(winner.id, sender)) as DmMessageView,
        }
      : { ok: false, error: "not_found" };
  }
  if (input.photoId !== null) {
    await db
      .update(dmPhotos)
      .set({ messageId: row.id })
      .where(eq(dmPhotos.id, input.photoId));
  }
  await db
    .update(dmConversations)
    .set({ lastMessageId: row.id, lastMessageAt: now })
    .where(eq(dmConversations.id, input.conversationId));
  // Writing counts as having read everything up to the own message.
  await markDmRead(input.conversationId, input.senderId, row.id);

  return {
    ok: true,
    created: true,
    recipientId,
    message: (await getDmMessageView(row.id, sender)) as DmMessageView,
  };
};

const findByClientId = async (conversationId: number, clientId: string) => {
  const [row] = await db
    .select()
    .from(dmMessages)
    .where(
      and(
        eq(dmMessages.conversationId, conversationId),
        eq(dmMessages.clientId, clientId),
      ),
    )
    .limit(1);

  return row ?? null;
};

// Only the sender, only a live message, still possible in a read-only chat
// (a member may always take back their own words). The photo bytes go too.
export const unsendDmMessage = async (
  conversationId: number,
  messageId: number,
  userId: number,
  now = new Date(),
): Promise<Result<object>> => {
  const view: DmView | null = await resolveDmView(conversationId, {
    kind: "user",
    id: userId,
  });

  if (!view || view.access !== "member") {
    return { ok: false, error: "not_found" };
  }
  const rows = await db
    .update(dmMessages)
    .set({ deletedAt: now, body: null, photoId: null, replyPostId: null })
    .where(
      and(
        eq(dmMessages.id, messageId),
        eq(dmMessages.conversationId, conversationId),
        eq(dmMessages.senderId, userId),
        sql`${dmMessages.deletedAt} is null`,
      ),
    )
    .returning({ id: dmMessages.id });

  if (rows.length === 0) {
    return { ok: false, error: "not_found" };
  }
  await db.delete(dmPhotos).where(eq(dmPhotos.messageId, messageId));
  return { ok: true };
};

// Read marks only move forward, and never past the last message.
export const markDmRead = async (
  conversationId: number,
  userId: number,
  lastReadMessageId: number,
) => {
  await db
    .insert(dmReads)
    .values({ conversationId, userId, lastReadMessageId })
    .onConflictDoUpdate({
      target: [dmReads.conversationId, dmReads.userId],
      set: {
        lastReadMessageId: sql`max(${dmReads.lastReadMessageId}, ${lastReadMessageId})`,
      },
    });
};

// Marks everything in the conversation as read; for a member only.
export const markDmConversationRead = async (
  conversationId: number,
  userId: number,
) => {
  const conversation = await findDmConversation(conversationId);

  if (!conversation?.lastMessageId) {
    return;
  }
  await markDmRead(conversationId, userId, conversation.lastMessageId);
};

// Account deletion: the trainee's conversations with everything in them.
export const deleteDmDataOfUser = async (
  executor: Pick<typeof db, "delete" | "select">,
  userId: number,
) => {
  const conversations = await executor
    .select({ id: dmConversations.id })
    .from(dmConversations)
    .where(
      sql`${dmConversations.userLow} = ${userId} or ${dmConversations.userHigh} = ${userId}`,
    );
  const ids = conversations.map((row) => row.id);

  for (const id of ids) {
    await executor.delete(dmPhotos).where(eq(dmPhotos.conversationId, id));
    await executor.delete(dmMessages).where(eq(dmMessages.conversationId, id));
    await executor.delete(dmReads).where(eq(dmReads.conversationId, id));
    await executor.delete(dmConversations).where(eq(dmConversations.id, id));
  }
};
