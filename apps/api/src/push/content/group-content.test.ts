import { describe, expect, it } from "vitest";

import { buildGroupMessagePush } from "./group-content.js";
import { pushContent } from "./index.js";

// Company group-push-rules.test.ts.
describe("buildGroupMessagePush", () => {
  it("titles the push with the group and prefixes the sender", () => {
    expect(
      buildGroupMessagePush({
        recipientRole: "user",
        groupId: 7,
        groupName: "Lớp sáng",
        senderName: "An",
        body: "hẹn 6h",
      }),
    ).toEqual({
      title: "Lớp sáng",
      body: "An: hẹn 6h",
      url: "/messages/groups/7",
      tag: "chat-group-7",
    });
  });

  it("opens the admin route for an admin and drops an empty sender", () => {
    const push = buildGroupMessagePush({
      recipientRole: "admin",
      groupId: 7,
      groupName: "G",
      senderName: "  ",
      body: "hi",
    });

    expect(push.url).toBe("/admin/messages/groups/7");
    expect(push.body).toBe("hi");
  });

  it("words photos and stickers in the recipient's language", () => {
    expect(
      pushContent.group_message({
        recipientRole: "user",
        groupId: 1,
        groupName: "G",
        senderName: "An",
        photo: true,
        photoCount: 3,
        locale: "en",
      }).body,
    ).toBe("An: Sent 3 photos");
    expect(
      pushContent.group_message({
        recipientRole: "user",
        groupId: 1,
        groupName: "G",
        senderName: "An",
        sticker: true,
        locale: "zh",
      }).body,
    ).toBe("An: 发送了一个贴纸");
  });
});
