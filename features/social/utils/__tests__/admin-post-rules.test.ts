import { describe, expect, it } from "vitest";

import { shouldNotifyAdminPost } from "@/features/social/utils/admin-post-rules";
import {
  buildAdminPostPush,
  notificationHref,
  notificationText,
} from "@/features/social/utils/engagement-rules";

describe("shouldNotifyAdminPost", () => {
  it("tells nobody about an only_me post", () => {
    expect(shouldNotifyAdminPost("only_me")).toBe(false);
  });

  it("notifies for everyone and friends posts", () => {
    expect(shouldNotifyAdminPost("everyone")).toBe(true);
    expect(shouldNotifyAdminPost("friends")).toBe(true);
  });
});

describe("admin post push", () => {
  it("previews the caption", () => {
    expect(
      buildAdminPostPush("PT Hoan", "user:4", 9, "Tập chân hôm nay"),
    ).toEqual({
      title: "PT App",
      body: "PT Hoan vừa đăng bài mới: Tập chân hôm nay",
      url: "/post/9",
      tag: "social-post-9",
    });
  });

  it("shortens a long caption", () => {
    const body = buildAdminPostPush("PT", "user:4", 9, "a".repeat(100)).body;

    expect(body).toBe(`PT vừa đăng bài mới: ${"a".repeat(60)}…`);
  });

  it("uses the photo line without a caption", () => {
    for (const caption of [null, "", "  \n "]) {
      expect(buildAdminPostPush("PT Hoan", "user:4", 9, caption).body).toBe(
        "PT Hoan vừa đăng một ảnh mới",
      );
    }
  });

  it("speaks English and Chinese", () => {
    expect(buildAdminPostPush("PT", "user:4", 9, "Leg day", "en").body).toBe(
      "PT posted: Leg day",
    );
    expect(buildAdminPostPush("PT", "user:4", 9, null, "en").body).toBe(
      "PT posted a new photo",
    );
    expect(buildAdminPostPush("PT", "user:4", 9, "腿部训练", "zh").body).toBe(
      "PT 发布了新帖子：腿部训练",
    );
  });

  it("words the notification row and links it to the post", () => {
    expect(notificationText("admin_post", "PT Hoan")).toBe(
      "PT Hoan vừa đăng bài mới",
    );
    expect(notificationHref("admin_post", "user:4", 9)).toBe("/post/9");
  });
});
