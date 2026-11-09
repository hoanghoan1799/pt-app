import { describe, expect, it } from "vitest";

import {
  buildChatPushPayload,
  buildPushPreview,
  buildReactionPushPayload,
} from "@/features/chat/utils/push-rules";
import { buildDmPushPayload } from "@/features/social/utils/dm-rules";
import {
  buildCommentPush,
  buildFriendPush,
  buildReactionPush,
  notificationText,
} from "@/features/social/utils/engagement-rules";

describe("push text per recipient locale", () => {
  it("labels message kinds in English and keeps Vietnamese by default", () => {
    expect(buildPushPreview({ photo: true, locale: "en" })).toBe(
      "Sent a photo",
    );
    expect(buildPushPreview({ sticker: true, locale: "en" })).toBe(
      "Sent a sticker",
    );
    expect(buildPushPreview({ body: "https://x.com/a", locale: "en" })).toBe(
      "Sent a link",
    );
    expect(buildPushPreview({ body: "  ", locale: "en" })).toBe(
      "Sent a message",
    );
    expect(buildPushPreview({ body: "Em tập xong rồi", locale: "en" })).toBe(
      "Em tập xong rồi",
    );
    expect(buildPushPreview({ photo: true })).toBe("Đã gửi ảnh");
  });

  it("keeps the payload shape in English", () => {
    expect(
      buildChatPushPayload({
        recipientRole: "admin",
        senderName: "Lan",
        traineeUserId: 4,
        conversationId: 3,
        photo: true,
        locale: "en",
      }),
    ).toEqual({
      title: "Lan",
      body: "Sent a photo",
      url: "/admin/users/4/messages",
      tag: "chat-3",
    });
    expect(
      buildReactionPushPayload({
        recipientRole: "user",
        reactorName: "Hoan",
        emoji: "❤️",
        traineeUserId: 4,
        conversationId: 3,
        locale: "en",
      }),
    ).toMatchObject({
      title: "PT App",
      body: "Hoan reacted ❤️ to your message",
      tag: "chat-react-3",
    });
    expect(
      buildDmPushPayload({
        senderName: "Lan",
        conversationId: 9,
        body: null,
        photo: true,
        locale: "en",
      }).body,
    ).toBe("Sent a photo");
  });

  it("words social pushes in English", () => {
    expect(buildReactionPush("Lan", "user:1", 7, "en").body).toBe(
      "Lan reacted to your post",
    );
    expect(buildCommentPush("Lan", "user:1", 7, "Great", "en").body).toBe(
      "Lan commented: Great",
    );
    expect(buildFriendPush("friend_request", "Lan", "en").body).toBe(
      "Lan sent you a friend request",
    );
    expect(notificationText("friend_accepted", "Lan", "en")).toBe(
      "Lan accepted your friend request",
    );
    expect(notificationText("friend_accepted", "Lan")).toBe(
      "Lan đã chấp nhận lời mời kết bạn",
    );
  });
});
