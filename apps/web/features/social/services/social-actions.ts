"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { SOCIAL_MESSAGES } from "@/features/social/constants/social";
import {
  getFeedPage,
  getProfilePosts,
  profileKey,
} from "@/features/social/services/social-queries";
import {
  requireWho,
  type Who,
} from "@/features/social/services/social-session";
import type { PostPage, PostSource } from "@/features/social/types/social";
import {
  bioSchema,
  createPostSchema,
  editPostSchema,
  postIdSchema,
} from "@/features/social/utils/post-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdminForUser } from "@/services/admin-access";
import { callApi } from "@/services/api/call";
import { requireUser } from "@/services/auth-guard";
import type { ActionErrorResult } from "@/types/error";

// Every action starts with requireUser() / requireAdmin() and validates its
// input with Zod; the API checks the terms, ownership and visibility again and
// its refusals come back as the message the person sees.

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

const refresh = () => {
  revalidatePath("/feed");
  revalidatePath("/profile", "layout");
  revalidatePath("/admin/social", "layout");
};

export const acceptTermsAction = withResultErrorHandling(
  "acceptTerms",
  async () => {
    await requireUser();
    await callApi("user", (api) => api.POST("/v1/social/me/terms"));
    revalidatePath(ROUTES.FEED);
  },
);

// `idempotencyKey` is made once per submit by the composer: a retry of the
// same submit (double tap, flaky network) returns the first post.
export const createPostAction = withResultErrorHandling(
  "createPost",
  async (who: Who, input: unknown, idempotencyKey: string) => {
    const actor = await requireWho(who);
    const parsed = createPostSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.EMPTY_POST,
      );
    }
    await callApi(
      actor,
      (api) =>
        api.POST("/v1/social/posts", {
          body: parsed.data,
          params: { header: { "Idempotency-Key": idempotencyKey } },
        }),
      { idempotencyKey },
    );
    refresh();
  },
);

export const editPostAction = withResultErrorHandling(
  "editPost",
  async (who: Who, input: unknown) => {
    const actor = await requireWho(who);
    const parsed = editPostSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.EMPTY_POST,
      );
    }
    const { postId, caption, privacy } = parsed.data;

    await callApi(actor, (api) =>
      api.PATCH("/v1/social/posts/{id}", {
        params: { path: { id: String(postId) } },
        body: { caption, privacy },
      }),
    );
    refresh();
  },
);

export const deletePostAction = withResultErrorHandling(
  "deletePost",
  async (who: Who, postId: unknown) => {
    const actor = await requireWho(who);
    const id = postIdSchema.safeParse(postId);

    if (!id.success) {
      return fail(SOCIAL_MESSAGES.NOT_FOUND);
    }
    await callApi(actor, (api) =>
      api.DELETE("/v1/social/posts/{id}", {
        params: { path: { id: String(id.data) } },
      }),
    );
    refresh();
  },
);

export const updateBioAction = withResultErrorHandling(
  "updateBio",
  async (who: Who, bio: unknown) => {
    const actor = await requireWho(who);
    const parsed = bioSchema.safeParse(bio);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.BIO_TOO_LONG,
      );
    }
    await callApi(actor, (api) =>
      api.PUT("/v1/me/bio", { body: { bio: parsed.data } }),
    );
    refresh();
  },
);

export type LoadPostsResult =
  { status: "success"; page: PostPage } | ActionErrorResult;

// "Xem thêm": the next page of a feed or profile, with the cursor the API gave
// for the previous one. The API filters for the signed-in viewer.
export const loadMorePostsAction = withResultErrorHandling(
  "loadMorePosts",
  async (
    who: Who,
    source: PostSource,
    cursor: unknown,
  ): Promise<LoadPostsResult> => {
    const actor = await requireWho(who);

    if (typeof cursor !== "string" || cursor === "") {
      return fail(SOCIAL_MESSAGES.NOT_FOUND);
    }
    if (source.type === "profile") {
      // A trainee's profile only for admins who may work with the trainee.
      if (actor === "admin" && source.kind === "user") {
        await requireAdminForUser(source.id);
      }
      return {
        status: "success",
        page: await getProfilePosts(
          actor,
          profileKey(source.kind, source.id),
          cursor,
        ),
      };
    }
    return { status: "success", page: await getFeedPage(actor, cursor) };
  },
);
