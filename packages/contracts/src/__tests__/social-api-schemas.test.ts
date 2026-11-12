import {
  parseSocialActorKey,
  SOCIAL_FRIEND_MESSAGES,
  SOCIAL_MESSAGES,
  socialPairOf,
} from "../social.js";
import {
  SOCIAL_IDEMPOTENCY_KEY_PATTERN,
  socialCommentRequestSchema,
  socialCreatePostRequestSchema,
  socialFriendRequestSchema,
  socialIdPathSchema,
  socialNotificationsQuerySchema,
  socialPostsQuerySchema,
  socialProfilePathSchema,
  socialReactionRequestSchema,
  socialReportRequestSchema,
  socialResolveReportRequestSchema,
} from "../social-api-schemas.js";
import { describe, expect, it } from "vitest";

describe("post requests", () => {
  it("trims the caption, defaults the photo and bounds the length", () => {
    expect(
      socialCreatePostRequestSchema.parse({ caption: "  hi  ", privacy: "friends" }),
    ).toEqual({ caption: "hi", privacy: "friends", photoId: null });
    expect(
      socialCreatePostRequestSchema.parse({ caption: "a".repeat(2000), privacy: "only_me", photoId: 4 })
        .photoId,
    ).toBe(4);

    const long = socialCreatePostRequestSchema.safeParse({
      caption: "a".repeat(2001),
      privacy: "friends",
    });

    expect(long.success).toBe(false);
    expect(long.error?.issues[0].message).toBe(SOCIAL_MESSAGES.CAPTION_TOO_LONG);
    for (const privacy of ["public", "", null, undefined]) {
      expect(socialCreatePostRequestSchema.safeParse({ caption: "x", privacy }).success).toBe(false);
    }
    for (const photoId of [0, -1, 1.5, "3", 2147483648]) {
      expect(
        socialCreatePostRequestSchema.safeParse({ caption: "x", privacy: "friends", photoId }).success,
      ).toBe(false);
    }
  });
});

describe("reaction and comment requests", () => {
  it("accepts the six emoji only", () => {
    for (const emoji of ["❤️", "😂", "😮", "😢", "💪", "👍"]) {
      expect(socialReactionRequestSchema.safeParse({ emoji }).success, emoji).toBe(true);
    }
    for (const emoji of ["🔥", "", null, "❤"]) {
      expect(socialReactionRequestSchema.safeParse({ emoji }).success, String(emoji)).toBe(false);
    }
    expect(socialReactionRequestSchema.safeParse({ emoji: "🔥" }).error?.issues[0].message).toBe(
      SOCIAL_MESSAGES.REACTION_INVALID,
    );
  });

  it("trims the comment and bounds it at 1000 characters", () => {
    expect(socialCommentRequestSchema.parse({ body: "  hay  " })).toEqual({ body: "hay" });
    expect(socialCommentRequestSchema.safeParse({ body: "  " }).error?.issues[0].message).toBe(
      SOCIAL_MESSAGES.COMMENT_EMPTY,
    );
    expect(socialCommentRequestSchema.safeParse({ body: "a".repeat(1000) }).success).toBe(true);
    expect(
      socialCommentRequestSchema.safeParse({ body: "a".repeat(1001) }).error?.issues[0].message,
    ).toBe(SOCIAL_MESSAGES.COMMENT_TOO_LONG);
  });
});

describe("reports and friends", () => {
  it("bounds the reason at 500 characters and defaults it to empty", () => {
    expect(
      socialReportRequestSchema.parse({ targetKind: "post", targetId: 3 }),
    ).toEqual({ targetKind: "post", targetId: 3, reason: "" });
    expect(
      socialReportRequestSchema.parse({ targetKind: "user", targetId: 3, reason: " r " }).reason,
    ).toBe("r");
    expect(
      socialReportRequestSchema.safeParse({ targetKind: "user", targetId: 3, reason: "a".repeat(501) })
        .error?.issues[0].message,
    ).toBe(SOCIAL_FRIEND_MESSAGES.REASON_TOO_LONG);
    expect(socialReportRequestSchema.safeParse({ targetKind: "dm", targetId: 3 }).success).toBe(false);
    expect(socialResolveReportRequestSchema.safeParse({ resolution: "kept" }).success).toBe(true);
    expect(socialResolveReportRequestSchema.safeParse({ resolution: "ignored" }).success).toBe(false);
    expect(socialFriendRequestSchema.safeParse({ userId: 0 }).success).toBe(false);
    expect(socialFriendRequestSchema.safeParse({ userId: 7 }).success).toBe(true);
  });
});

describe("Idempotency-Key", () => {
  it("allows 1 to 128 safe characters", () => {
    for (const key of ["a", "retry-1", "550e8400-e29b-41d4-a716-446655440000", "x".repeat(128), "a.b_c:d"]) {
      expect(SOCIAL_IDEMPOTENCY_KEY_PATTERN.test(key), key).toBe(true);
    }
    for (const key of ["", "has space", "x".repeat(129), "tab	", "é"]) {
      expect(SOCIAL_IDEMPOTENCY_KEY_PATTERN.test(key), key).toBe(false);
    }
  });
});

describe("paths and queries", () => {
  it("reads ids as digits only", () => {
    expect(socialIdPathSchema.parse({ id: "42" })).toEqual({ id: 42 });
    for (const id of ["0", "-1", "1e3", " 7", "4.5", "abc", "", "9999999999"]) {
      expect(socialIdPathSchema.safeParse({ id }).success, id).toBe(false);
    }
  });

  it("parses a profile key and refuses a lookalike", () => {
    expect(socialProfilePathSchema.parse({ key: "user:12" })).toEqual({
      key: { kind: "user", id: 12 },
    });
    expect(socialProfilePathSchema.parse({ key: "admin:3" }).key).toEqual({ kind: "admin", id: 3 });
    for (const key of ["user:0", "user:1:2", "nobody:1", "user", "user:-3", "user:012"]) {
      expect(socialProfilePathSchema.safeParse({ key }).success, key).toBe(false);
    }
    expect(parseSocialActorKey("user:12")).toEqual({ kind: "user", id: 12 });
    expect(parseSocialActorKey("user:x")).toBeNull();
  });

  it("defaults and bounds the page size per list", () => {
    expect(socialPostsQuerySchema.parse({})).toEqual({ limit: 10 });
    expect(socialNotificationsQuerySchema.parse({ limit: "100" })).toEqual({ limit: 100 });
    expect(socialNotificationsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(socialPostsQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(socialPostsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(socialPostsQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
  });

  it("orders a friendship pair smaller id first", () => {
    expect(socialPairOf(9, 3)).toEqual({ low: 3, high: 9 });
    expect(socialPairOf(3, 9)).toEqual({ low: 3, high: 9 });
  });
});
