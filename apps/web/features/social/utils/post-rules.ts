import { z } from "zod";

import {
  BIO_MAX_LENGTH,
  CAPTION_MAX_LENGTH,
  POST_PRIVACIES,
  POSTS_PREFETCH_AT,
  SOCIAL_MESSAGES,
} from "@/features/social/constants/social";
import type { PostAuthorRef } from "@/features/social/types/social";

export const privacySchema = z.enum(POST_PRIVACIES);

export const captionSchema = z
  .string()
  .trim()
  .max(CAPTION_MAX_LENGTH, SOCIAL_MESSAGES.CAPTION_TOO_LONG);

export const bioSchema = z
  .string()
  .trim()
  .max(BIO_MAX_LENGTH, SOCIAL_MESSAGES.BIO_TOO_LONG);

const idSchema = z.number().int().positive();

export const createPostSchema = z.object({
  caption: captionSchema,
  privacy: privacySchema,
  photoId: idSchema.nullable(),
});

export const editPostSchema = z.object({
  postId: idSchema,
  caption: captionSchema,
  privacy: privacySchema,
});

export const postIdSchema = idSchema;

export const actorKey = (actor: PostAuthorRef) => `${actor.kind}:${actor.id}`;

export const socialPhotoUrl = (id: number) => `/api/social/photos/${id}`;

export const profilePath = (kind: "user" | "admin", id: number) =>
  `/profile/${kind}/${id}`;

export const adminProfilePath = (kind: "user" | "admin", id: number) =>
  `/admin/social/profile/${kind}/${id}`;

export const parseProfileKind = (value: string): "user" | "admin" | null =>
  value === "user" || value === "admin" ? value : null;

// Index of the post whose appearance loads the next page: the
// POSTS_PREFETCH_AT-th post of the last loaded page, or the last post when
// that page is shorter. -1 when there is nothing to watch.
export const prefetchTriggerIndex = (
  total: number,
  lastPageStart: number,
): number => {
  if (total <= 0) {
    return -1;
  }
  const start = Math.min(Math.max(lastPageStart, 0), total - 1);

  return Math.min(start + POSTS_PREFETCH_AT - 1, total - 1);
};
