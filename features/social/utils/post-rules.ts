import { z } from "zod";

import {
  BIO_MAX_LENGTH,
  CAPTION_MAX_LENGTH,
  POST_PRIVACIES,
  SOCIAL_MESSAGES,
} from "@/features/social/constants/social";
import type {
  PostAuthorRef,
  SocialActor,
} from "@/features/social/types/social";

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

// A post needs text or a photo.
export const isPostEmpty = (caption: string, hasPhoto: boolean) =>
  caption.trim() === "" && !hasPhoto;

export const actorKey = (actor: PostAuthorRef) => `${actor.kind}:${actor.id}`;

export const isSameAuthor = (actor: SocialActor, author: PostAuthorRef) =>
  actor.kind === author.kind && actor.id === author.id;

// Author edits and deletes their own post; a super admin deletes any.
export const canEditPost = (actor: SocialActor, author: PostAuthorRef) =>
  isSameAuthor(actor, author);

export const canDeletePost = (actor: SocialActor, author: PostAuthorRef) =>
  isSameAuthor(actor, author) ||
  (actor.kind === "admin" && actor.role === "super_admin");

export const socialPhotoUrl = (id: number) => `/api/social/photos/${id}`;

export const profilePath = (kind: "user" | "admin", id: number) =>
  `/profile/${kind}/${id}`;

export const adminProfilePath = (kind: "user" | "admin", id: number) =>
  `/admin/social/profile/${kind}/${id}`;

export const parseProfileKind = (value: string): "user" | "admin" | null =>
  value === "user" || value === "admin" ? value : null;
