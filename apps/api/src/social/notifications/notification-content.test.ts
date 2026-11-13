import { SOCIAL_NOTIFICATION_KINDS } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  buildNotificationPush,
  buildNotificationText,
  deletedAccountName,
  type NotificationFacts,
  previewText,
  toLocale,
} from "./notification-content.js";

const facts = (
  overrides: Partial<NotificationFacts> = {},
): NotificationFacts => ({
  kind: "post_reaction",
  actorName: "Ann",
  locale: "vi",
  recipientKey: "user:5",
  postId: 12,
  ...overrides,
});

describe("notification text", () => {
  it("writes the Vietnamese copy of every kind", () => {
    const text = (kind: NotificationFacts["kind"]) =>
      buildNotificationText(facts({ kind }));

    expect(text("post_reaction")).toBe(
      "Ann đã bày tỏ cảm xúc về bài viết của bạn",
    );
    expect(text("post_comment")).toBe("Ann đã bình luận về bài viết của bạn");
    expect(text("friend_request")).toBe("Ann đã gửi lời mời kết bạn");
    expect(text("friend_accepted")).toBe("Ann đã chấp nhận lời mời kết bạn");
    expect(text("admin_post")).toBe("Ann vừa đăng bài mới");
  });

  it("has English and Chinese copy for every kind, and falls back to Vietnamese", () => {
    for (const kind of SOCIAL_NOTIFICATION_KINDS) {
      for (const locale of ["en", "zh"] as const) {
        const text = buildNotificationText(facts({ kind, locale }));

        expect(text, `${kind} ${locale}`).toContain("Ann");
        expect(text).not.toContain("{");
      }
    }
    expect(buildNotificationText(facts({ locale: "en" }))).toBe(
      "Ann reacted to your post",
    );
    expect(toLocale("fr")).toBe("vi");
    expect(toLocale(null)).toBe("vi");
    expect(toLocale("zh")).toBe("zh");
    expect(deletedAccountName("vi")).toBe("Đã xóa");
    expect(deletedAccountName("en")).toBe("Deleted account");
  });
});

describe("push payloads", () => {
  it("links reactions and comments to the post page of the recipient's side", () => {
    expect(buildNotificationPush(facts())).toEqual({
      title: "PT App",
      body: "Ann đã bày tỏ cảm xúc về bài viết của bạn",
      url: "/post/12",
      tag: "social-react-12",
    });
    expect(buildNotificationPush(facts({ recipientKey: "admin:2" })).url).toBe(
      "/admin/social/post/12",
    );
  });

  it("shortens a long comment to a preview and flattens whitespace", () => {
    const push = buildNotificationPush(
      facts({
        kind: "post_comment",
        commentBody: `${"a".repeat(80)}\n\nb`,
      }),
    );

    expect(push.body).toBe(`Ann đã bình luận: ${"a".repeat(60)}…`);
    expect(push.tag).toBe("social-comment-12");
    expect(previewText("  hi   there \n you ")).toBe("hi there you");
  });

  it("says a new photo for an admin post without a caption", () => {
    const withCaption = buildNotificationPush(
      facts({ kind: "admin_post", caption: "Lịch tập\ntuần mới" }),
    );
    const photoOnly = buildNotificationPush(
      facts({ kind: "admin_post", caption: null }),
    );

    expect(withCaption.body).toBe("Ann vừa đăng bài mới: Lịch tập tuần mới");
    expect(withCaption.tag).toBe("social-post-12");
    expect(photoOnly.body).toBe("Ann vừa đăng một ảnh mới");
  });

  it("sends friend events to the friends pages", () => {
    expect(
      buildNotificationPush(facts({ kind: "friend_request", postId: null })),
    ).toMatchObject({
      url: "/friends?tab=requests",
      tag: "social-friend_request",
    });
    expect(
      buildNotificationPush(facts({ kind: "friend_accepted", postId: null }))
        .url,
    ).toBe("/friends");
  });
});
