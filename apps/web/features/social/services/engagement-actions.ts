"use server";

import { revalidatePath } from "next/cache";

import { SOCIAL_MESSAGES } from "@/features/social/constants/social";
import { resolveActor, type Who } from "@/features/social/services/actor-guard";
import {
  addComment,
  deleteComment,
  editComment,
  type EngagementError,
  reactToPost,
} from "@/features/social/services/engagement-mutations";
import { listReactors } from "@/features/social/services/engagement-queries";
import { scheduleSocialPush } from "@/features/social/services/social-notifications";
import type { ReactorView } from "@/features/social/types/social";
import {
  addCommentSchema,
  commentIdSchema,
  editCommentSchema,
  reactSchema,
} from "@/features/social/utils/engagement-rules";
import { postIdSchema } from "@/features/social/utils/post-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import type { ActionErrorResult } from "@/types/error";

// Every action resolves the actor first (requireUser / requireAdmin plus the
// terms gate), validates with Zod, and the services re-check canSeePost.

const MESSAGES: Record<EngagementError, string> = {
  not_found: SOCIAL_MESSAGES.NOT_FOUND,
  forbidden: SOCIAL_MESSAGES.NOT_ALLOWED,
};

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

// Counts, the post page and the bell all change with a reaction or comment.
const refresh = () => {
  revalidatePath("/feed");
  revalidatePath("/profile", "layout");
  revalidatePath("/post", "layout");
  revalidatePath("/notifications");
  revalidatePath("/admin/social", "layout");
};

export const reactAction = withResultErrorHandling(
  "reactToPost",
  async (who: Who, input: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = reactSchema.safeParse(input);

    if (!parsed.success) {
      return fail(SOCIAL_MESSAGES.REACTION_INVALID);
    }
    const result = await reactToPost(
      actor,
      parsed.data.postId,
      parsed.data.emoji,
    );

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    if (result.notificationId !== null) {
      scheduleSocialPush({ notificationId: result.notificationId });
    }
    refresh();
  },
);

export const addCommentAction = withResultErrorHandling(
  "addComment",
  async (who: Who, input: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = addCommentSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.COMMENT_EMPTY,
      );
    }
    const result = await addComment(
      actor,
      parsed.data.postId,
      parsed.data.body,
    );

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    if (result.notificationId !== null) {
      scheduleSocialPush({
        notificationId: result.notificationId,
        commentBody: parsed.data.body,
      });
    }
    refresh();
  },
);

export const editCommentAction = withResultErrorHandling(
  "editComment",
  async (who: Who, input: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = editCommentSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.COMMENT_EMPTY,
      );
    }
    const result = await editComment(
      actor,
      parsed.data.commentId,
      parsed.data.body,
    );

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    refresh();
  },
);

export const deleteCommentAction = withResultErrorHandling(
  "deleteComment",
  async (who: Who, commentId: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const id = commentIdSchema.safeParse(commentId);

    if (!id.success) {
      return fail(SOCIAL_MESSAGES.COMMENT_NOT_FOUND);
    }
    const result = await deleteComment(actor, id.data);

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    refresh();
  },
);

export type ListReactorsResult =
  { status: "success"; reactors: ReactorView[] } | ActionErrorResult;

export const listReactorsAction = withResultErrorHandling(
  "listReactors",
  async (who: Who, postId: unknown): Promise<ListReactorsResult> => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const id = postIdSchema.safeParse(postId);

    if (!id.success) {
      return fail(SOCIAL_MESSAGES.NOT_FOUND);
    }
    const reactors = await listReactors(actor, id.data);

    return reactors
      ? { status: "success", reactors }
      : fail(SOCIAL_MESSAGES.NOT_FOUND);
  },
);
