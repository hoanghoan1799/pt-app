import { describe, expect, it } from "vitest";

import {
  BIO_MAX_LENGTH,
  CAPTION_MAX_LENGTH,
  POSTS_PAGE_SIZE,
  POSTS_PREFETCH_AT,
} from "@/features/social/constants/social";
import {
  bioSchema,
  createPostSchema,
  MAX_POST_PHOTOS,
  parseProfileKind,
  photoSlots,
  prefetchTriggerIndex,
} from "@/features/social/utils/post-rules";

describe("post rules", () => {
  it("limits caption and bio length", () => {
    const base = { privacy: "friends", photoIds: [] };

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

describe("photos of a post", () => {
  const base = { caption: "hi", privacy: "friends" } as const;
  const parse = (photoIds: unknown) =>
    createPostSchema.safeParse({ ...base, photoIds });

  it("allows up to 10 photos", () => {
    expect(MAX_POST_PHOTOS).toBe(10);
    expect(parse([]).success).toBe(true);
    expect(parse([1]).success).toBe(true);
    expect(parse(Array.from({ length: 10 }, (_, i) => i + 1)).success).toBe(
      true,
    );
  });

  it("rejects 11 photos, duplicates, bad ids and the old single photoId", () => {
    expect(parse(Array.from({ length: 11 }, (_, i) => i + 1)).success).toBe(
      false,
    );
    expect(parse([1, 2, 1]).success).toBe(false);
    expect(parse([0]).success).toBe(false);
    expect(parse([-1]).success).toBe(false);
    expect(parse([1.5]).success).toBe(false);
    expect(parse(null).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, photoId: 3 }).success).toBe(
      false,
    );
  });

  it("keeps the order of the ids", () => {
    const parsed = parse([5, 2, 9]);

    expect(parsed.success && parsed.data.photoIds).toEqual([5, 2, 9]);
  });

  it("counts how many picked photos fit", () => {
    expect(photoSlots(0, 3)).toEqual({ accepted: 3, dropped: 0 });
    expect(photoSlots(8, 5)).toEqual({ accepted: 2, dropped: 3 });
    expect(photoSlots(10, 1)).toEqual({ accepted: 0, dropped: 1 });
    expect(photoSlots(12, 1)).toEqual({ accepted: 0, dropped: 1 });
    expect(photoSlots(0, 0)).toEqual({ accepted: 0, dropped: 0 });
  });
});

describe("the error of too many photos", () => {
  it("uses the shared message with the limit", () => {
    const result = createPostSchema.safeParse({
      caption: "hi",
      privacy: "friends",
      photoIds: Array.from({ length: MAX_POST_PHOTOS + 1 }, (_, i) => i + 1),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Mỗi bài viết tối đa 10 ảnh.",
    );
  });
});
