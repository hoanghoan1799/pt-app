"use server";

import { revalidatePath } from "next/cache";

import { SOCIAL_MESSAGES } from "@/features/social/constants/social";
import {
  requireWho,
  type Who,
} from "@/features/social/services/social-session";
import type { ReactorView } from "@/features/social/types/social";
import {
  addCommentSchema,
  commentIdSchema,
  editCommentSchema,
  reactSchema,
} from "@/features/social/utils/engagement-rules";
import { postIdSchema } from "@/features/social/utils/post-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { callApi } from "@/services/api/call";
import type { ActionErrorResult } from "@/types/error";

// Every action starts with requireUser / requireAdmin, validates with Zod and
// leaves the terms, visibility and blocks to the API.

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
    const actor = await requireWho(who);
    const parsed = reactSchema.safeParse(input);

    if (!parsed.success) {
      return fail(SOCIAL_MESSAGES.REACTION_INVALID);
    }
    const { postId, emoji } = parsed.data;

    if (emoji === null) {
      await callApi(actor, (api) =>
        api.DELETE("/v1/social/posts/{id}/reaction", {
          params: { path: { id: String(postId) } },
        }),
      );
    } else {
      await callApi(actor, (api) =>
        api.PUT("/v1/social/posts/{id}/reaction", {
          params: { path: { id: String(postId) } },
          body: { emoji },
        }),
      );
    }
    refresh();
  },
);

export const addCommentAction = withResultErrorHandling(
  "addComment",
  async (who: Who, input: unknown) => {
    const actor = await requireWho(who);
    const parsed = addCommentSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.COMMENT_EMPTY,
      );
    }
    await callApi(actor, (api) =>
      api.POST("/v1/social/posts/{id}/comments", {
        params: { path: { id: String(parsed.data.postId) } },
        body: { body: parsed.data.body },
      }),
    );
    refresh();
  },
);

export const editCommentAction = withResultErrorHandling(
  "editComment",
  async (who: Who, input: unknown) => {
    const actor = await requireWho(who);
    const parsed = editCommentSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.COMMENT_EMPTY,
      );
    }
    await callApi(actor, (api) =>
      api.PATCH("/v1/social/comments/{id}", {
        params: { path: { id: String(parsed.data.commentId) } },
        body: { body: parsed.data.body },
      }),
    );
    refresh();
  },
);

export const deleteCommentAction = withResultErrorHandling(
  "deleteComment",
  async (who: Who, commentId: unknown) => {
    const actor = await requireWho(who);
    const id = commentIdSchema.safeParse(commentId);

    if (!id.success) {
      return fail(SOCIAL_MESSAGES.COMMENT_NOT_FOUND);
    }
    await callApi(actor, (api) =>
      api.DELETE("/v1/social/comments/{id}", {
        params: { path: { id: String(id.data) } },
      }),
    );
    refresh();
  },
);

export type ListReactorsResult =
  { status: "success"; reactors: ReactorView[] } | ActionErrorResult;

export const listReactorsAction = withResultErrorHandling(
  "listReactors",
  async (who: Who, postId: unknown): Promise<ListReactorsResult> => {
    const actor = await requireWho(who);
    const id = postIdSchema.safeParse(postId);

    if (!id.success) {
      return fail(SOCIAL_MESSAGES.NOT_FOUND);
    }
    const { items } = await callApi(actor, (api) =>
      api.GET("/v1/social/posts/{id}/reactions", {
        params: { path: { id: String(id.data) } },
      }),
    );

    return { status: "success", reactors: items };
  },
);
