import { describe, expect, it } from "vitest";

import {
  BIO_MAX_LENGTH,
  CAPTION_MAX_LENGTH,
  POSTS_PAGE_SIZE,
  POSTS_PREFETCH_AT,
} from "@/features/social/constants/social";
import {
  bioSchema,
  canDeletePost,
  canEditPost,
  createPostSchema,
  isPostEmpty,
  parseProfileKind,
  prefetchTriggerIndex,
} from "@/features/social/utils/post-rules";

const superAdmin = { kind: "admin", id: 1, role: "super_admin" } as const;
const pt = { kind: "admin", id: 2, role: "pt" } as const;
const user = { kind: "user", id: 10 } as const;

describe("post rules", () => {
  it("needs a caption or a photo", () => {
    expect(isPostEmpty("   ", false)).toBe(true);
    expect(isPostEmpty("", true)).toBe(false);
    expect(isPostEmpty("hi", false)).toBe(false);
  });

  it("limits caption and bio length", () => {
    const base = { privacy: "friends", photoId: null };

    expect(
      createPostSchema.safeParse({
        ...base,
        caption: "a".repeat(CAPTION_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      createPostSchema.safeParse({
        ...base,
        caption: "a".repeat(CAPTION_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      createPostSchema.safeParse({ ...base, caption: "x", privacy: "public" })
        .success,
    ).toBe(false);
    expect(bioSchema.safeParse("a".repeat(BIO_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });

  it("lets only the author edit, and the author or a super admin delete", () => {
    expect(canEditPost(user, user)).toBe(true);
    expect(canEditPost(superAdmin, user)).toBe(false);
    expect(canDeletePost(user, user)).toBe(true);
    expect(canDeletePost(superAdmin, user)).toBe(true);
    expect(canDeletePost(pt, user)).toBe(false);
    expect(canDeletePost({ kind: "user", id: 11 }, user)).toBe(false);
  });

  it("parses the profile kind segment", () => {
    expect(parseProfileKind("user")).toBe("user");
    expect(parseProfileKind("admin")).toBe("admin");
    expect(parseProfileKind("root")).toBeNull();
  });
});

describe("prefetchTriggerIndex", () => {
  it("pages 10 posts and loads the next page at the 7th", () => {
    expect(POSTS_PAGE_SIZE).toBe(10);
    expect(POSTS_PREFETCH_AT).toBe(7);
  });

  it("points at the 7th post of the first page", () => {
    expect(prefetchTriggerIndex(10, 0)).toBe(6);
  });

  it("moves to the 7th post of the last loaded page", () => {
    expect(prefetchTriggerIndex(20, 10)).toBe(16);
    expect(prefetchTriggerIndex(30, 20)).toBe(26);
  });

  it("falls back to the last post of a short page", () => {
    expect(prefetchTriggerIndex(4, 0)).toBe(3);
    expect(prefetchTriggerIndex(13, 10)).toBe(12);
  });

  it("clamps a page start past the end and has nothing to watch when empty", () => {
    expect(prefetchTriggerIndex(5, 9)).toBe(4);
    expect(prefetchTriggerIndex(5, -3)).toBe(4);
    expect(prefetchTriggerIndex(0, 0)).toBe(-1);
  });
});
