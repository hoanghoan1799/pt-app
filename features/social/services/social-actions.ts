"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { SOCIAL_MESSAGES } from "@/features/social/constants/social";
import {
  resolveActor,
  traineeActor,
  type Who,
} from "@/features/social/services/actor-guard";
import { actorOfAdmin } from "@/features/social/services/post-context";
import {
  createPost,
  deletePost,
  editPost,
  type PostMutationError,
  updateBio,
} from "@/features/social/services/post-mutations";
import {
  listAdminFeed,
  listProfilePosts,
  listUserFeed,
} from "@/features/social/services/post-queries";
import { acceptTerms } from "@/features/social/services/terms";
import type { PostPage, PostSource } from "@/features/social/types/social";
import {
  bioSchema,
  createPostSchema,
  editPostSchema,
  postIdSchema,
} from "@/features/social/utils/post-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdminForUser } from "@/services/admin-access";
import { requireAdmin, requireUser } from "@/services/auth-guard";
import type { ActionErrorResult } from "@/types/error";

// Every action starts with requireUser() / requireAdmin() and validates its
// input with Zod. Trainee actions also need the accepted terms (spec T1).

const MESSAGES: Record<PostMutationError, string> = {
  empty: SOCIAL_MESSAGES.EMPTY_POST,
  not_found: SOCIAL_MESSAGES.NOT_FOUND,
  forbidden: SOCIAL_MESSAGES.NOT_ALLOWED,
  photo_not_found: SOCIAL_MESSAGES.PHOTO_NOT_FOUND,
};

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
    const user = await requireUser();

    await acceptTerms(user.id);
    revalidatePath(ROUTES.FEED);
  },
);

export const createPostAction = withResultErrorHandling(
  "createPost",
  async (who: Who, input: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = createPostSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.EMPTY_POST,
      );
    }
    const result = await createPost(actor, parsed.data);

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    refresh();
  },
);

export const editPostAction = withResultErrorHandling(
  "editPost",
  async (who: Who, input: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = editPostSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.EMPTY_POST,
      );
    }
    const result = await editPost(actor, parsed.data);

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    refresh();
  },
);

export const deletePostAction = withResultErrorHandling(
  "deletePost",
  async (who: Who, postId: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const id = postIdSchema.safeParse(postId);

    if (!id.success) {
      return fail(SOCIAL_MESSAGES.NOT_FOUND);
    }
    const result = await deletePost(actor, id.data);

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    refresh();
  },
);

export const updateBioAction = withResultErrorHandling(
  "updateBio",
  async (who: Who, bio: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = bioSchema.safeParse(bio);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? SOCIAL_MESSAGES.BIO_TOO_LONG,
      );
    }
    await updateBio(actor, parsed.data);
    refresh();
  },
);

export type LoadPostsResult =
  { status: "success"; page: PostPage } | ActionErrorResult;

// "Xem thêm": the next page of a feed or profile. The profile lists are
// filtered for the signed-in viewer on the server.
export const loadMorePostsAction = withResultErrorHandling(
  "loadMorePosts",
  async (
    who: Who,
    source: PostSource,
    cursor: unknown,
  ): Promise<LoadPostsResult> => {
    const after = postIdSchema.safeParse(cursor);

    if (!after.success) {
      return fail(SOCIAL_MESSAGES.NOT_FOUND);
    }
    if (who === "admin") {
      const admin = await requireAdmin();
      const actor = actorOfAdmin(admin);

      if (source.type === "profile") {
        // A trainee's profile only for admins who may work with the trainee.
        if (source.kind === "user") {
          await requireAdminForUser(source.id);
        }
        return {
          status: "success",
          page: await listProfilePosts(
            actor,
            { kind: source.kind, id: source.id },
            after.data,
          ),
        };
      }
      return {
        status: "success",
        page: await listAdminFeed(admin, after.data),
      };
    }
    const actor = await traineeActor();

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    if (source.type === "profile") {
      return {
        status: "success",
        page: await listProfilePosts(
          actor,
          { kind: source.kind, id: source.id },
          after.data,
        ),
      };
    }
    return {
      status: "success",
      page: await listUserFeed(actor.id, after.data),
    };
  },
);
