import { describe, expect, it } from "vitest";

import { REACTION_PUSH_INTERVAL_MS } from "@/features/social/constants/social";
import type { SocialActor } from "@/features/social/types/social";
import {
  addCommentSchema,
  applyReaction,
  buildCommentPush,
  buildReactionPush,
  canDeleteComment,
  canEditComment,
  notificationText,
  parseActorKey,
  previewComment,
  reactSchema,
  shouldPushReaction,
  summarizeReactions,
} from "@/features/social/utils/engagement-rules";

const user = (id: number): SocialActor => ({ kind: "user", id });
const admin = (id: number, role: "super_admin" | "pt"): SocialActor => ({
  kind: "admin",
  id,
  role,
});

describe("reaction schema", () => {
  it("accepts the six chat emoji and null, nothing else", () => {
    expect(reactSchema.safeParse({ postId: 1, emoji: "💪" }).success).toBe(
      true,
    );
    expect(reactSchema.safeParse({ postId: 1, emoji: null }).success).toBe(
      true,
    );
    expect(reactSchema.safeParse({ postId: 1, emoji: "🔥" }).success).toBe(
      false,
    );
    expect(reactSchema.safeParse({ postId: 0, emoji: "❤️" }).success).toBe(
      false,
    );
  });
});

describe("comment schema", () => {
  it("trims and bounds the body at 1000 characters", () => {
    expect(addCommentSchema.parse({ postId: 1, body: "  hi  " }).body).toBe(
      "hi",
    );
    expect(addCommentSchema.safeParse({ postId: 1, body: "   " }).success).toBe(
      false,
    );
    expect(
      addCommentSchema.safeParse({ postId: 1, body: "a".repeat(1000) }).success,
    ).toBe(true);
    expect(
      addCommentSchema.safeParse({ postId: 1, body: "a".repeat(1001) }).success,
    ).toBe(false);
  });
});

describe("comment permissions", () => {
  const post = { kind: "user" as const, id: 5 };

  it("only the commenter edits", () => {
    expect(canEditComment(user(1), "user:1")).toBe(true);
    expect(canEditComment(user(5), "user:1")).toBe(false);
    expect(canEditComment(admin(1, "super_admin"), "user:1")).toBe(false);
  });

  it("commenter, post author and super admin delete; others do not", () => {
    const comment = { authorKey: "user:1" };

    expect(canDeleteComment(user(1), comment, post)).toBe(true);
    expect(canDeleteComment(user(5), comment, post)).toBe(true);
    expect(canDeleteComment(admin(9, "super_admin"), comment, post)).toBe(true);
    expect(canDeleteComment(admin(9, "pt"), comment, post)).toBe(false);
    expect(canDeleteComment(user(2), comment, post)).toBe(false);
    // An admin sharing the post author's number is not the post author.
    expect(canDeleteComment(admin(5, "pt"), comment, post)).toBe(false);
  });
});

describe("reaction summary", () => {
  it("counts per emoji, most used first, with my own", () => {
    const summary = summarizeReactions(
      [
        { reactorKey: "user:1", emoji: "❤️" },
        { reactorKey: "user:2", emoji: "💪" },
        { reactorKey: "admin:1", emoji: "💪" },
      ],
      "user:1",
    );

    expect(summary).toEqual({
      counts: [
        { emoji: "💪", count: 2 },
        { emoji: "❤️", count: 1 },
      ],
      total: 3,
      mine: "❤️",
    });
  });

  it("applies set, change and remove optimistically", () => {
    const base = summarizeReactions(
      [{ reactorKey: "user:2", emoji: "👍" }],
      "user:1",
    );
    const set = applyReaction(base, "❤️");

    expect(set.total).toBe(2);
    expect(set.mine).toBe("❤️");
    const changed = applyReaction(set, "👍");

    expect(changed.total).toBe(2);
    expect(changed.counts).toEqual([{ emoji: "👍", count: 2 }]);
    const removed = applyReaction(changed, null);

    expect(removed.total).toBe(1);
    expect(removed.mine).toBeNull();
  });
});

describe("push rules", () => {
  it("throttles reaction pushes to one per hour", () => {
    const now = new Date("2026-11-08T10:00:00Z");

    expect(shouldPushReaction(null, now)).toBe(true);
    expect(shouldPushReaction(new Date(now.getTime() - 1000), now)).toBe(false);
    expect(
      shouldPushReaction(
        new Date(now.getTime() - REACTION_PUSH_INTERVAL_MS),
        now,
      ),
    ).toBe(true);
  });

  it("writes Vietnamese copy and links to the right post page", () => {
    expect(buildReactionPush("Lan", "user:1", 7)).toMatchObject({
      body: "Lan đã bày tỏ cảm xúc về bài viết của bạn",
      url: "/post/7",
    });
    expect(buildCommentPush("Lan", "admin:2", 7, "Tuyệt vời")).toMatchObject({
      body: "Lan đã bình luận: Tuyệt vời",
      url: "/admin/social/post/7",
    });
    expect(notificationText("post_comment", "Lan")).toBe(
      "Lan đã bình luận về bài viết của bạn",
    );
  });

  it("shortens long comments in the push", () => {
    expect(previewComment("a".repeat(100))).toBe(`${"a".repeat(60)}…`);
    expect(previewComment("a\n\n  b")).toBe("a b");
  });

  it("parses actor keys", () => {
    expect(parseActorKey("admin:3")).toEqual({ kind: "admin", id: 3 });
    expect(parseActorKey("bogus:3")).toBeNull();
    expect(parseActorKey("user:x")).toBeNull();
  });
});
