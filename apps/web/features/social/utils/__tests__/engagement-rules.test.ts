import { describe, expect, it } from "vitest";

import {
  addCommentSchema,
  applyReaction,
  buildCommentPush,
  buildReactionPush,
  notificationText,
  previewComment,
  reactSchema,
} from "@/features/social/utils/engagement-rules";

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

describe("reaction summary", () => {
  it("applies set, change and remove optimistically", () => {
    const base = {
      counts: [{ emoji: "👍", count: 1 }],
      total: 1,
      mine: null,
    };
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
});
