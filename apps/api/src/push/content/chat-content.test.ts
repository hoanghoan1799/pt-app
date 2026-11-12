import { describe, expect, it } from "vitest";

import {
  buildChatMessagePush,
  buildChatReactionPush,
  buildPushPreview,
  PUSH_PREVIEW_MAX_LENGTH,
} from "./chat-content.js";
import { pushContent } from "./index.js";

describe("buildPushPreview", () => {
  it("shows the text, keeping line breaks and collapsing spaces", () => {
    expect(
      buildPushPreview({ body: "  chào   PT\r\n\r\n\r\n\r\nhôm nay " }),
    ).toBe("chào PT\n\nhôm nay");
  });

  it("shows a kind label instead of a photo or sticker", () => {
    expect(buildPushPreview({ body: "caption", photo: true })).toBe(
      "Đã gửi ảnh",
    );
    expect(buildPushPreview({ body: "", sticker: true })).toBe(
      "Đã gửi sticker",
    );
  });

  it("shows a link label for a message that is only links", () => {
    expect(buildPushPreview({ body: "https://example.com/a" })).toBe(
      "Đã gửi liên kết",
    );
    expect(buildPushPreview({ body: "www.a.com\nhttps://b.com/x?y=1" })).toBe(
      "Đã gửi liên kết",
    );
    expect(buildPushPreview({ body: "xem https://example.com nhé" })).toBe(
      "xem https://example.com nhé",
    );
  });

  it("falls back for an empty body", () => {
    expect(buildPushPreview({ body: "   " })).toBe("Đã gửi tin nhắn");
    expect(buildPushPreview({ body: null })).toBe("Đã gửi tin nhắn");
  });

  it("cuts at 500 code points without splitting an emoji", () => {
    const preview = buildPushPreview({ body: "😀".repeat(600) });
    const chars = Array.from(preview);

    expect(chars).toHaveLength(PUSH_PREVIEW_MAX_LENGTH);
    expect(chars.at(-1)).toBe("…");
    expect(chars.slice(0, -1).every((char) => char === "😀")).toBe(true);
    expect(buildPushPreview({ body: "a".repeat(500) })).toHaveLength(500);
  });

  it("speaks the recipient's language", () => {
    expect(buildPushPreview({ photo: true, locale: "en" })).toBe(
      "Sent a photo",
    );
    expect(buildPushPreview({ photo: true, locale: "zh" })).toBe(
      "发送了一张照片",
    );
    expect(buildPushPreview({ body: " ", locale: "en" })).toBe(
      "Sent a message",
    );
    expect(buildPushPreview({ body: "https://a.com", locale: "zh" })).toBe(
      "发送了一个链接",
    );
  });
});

describe("buildChatMessagePush", () => {
  it("titles with the sender, opens the coach chat for a trainee", () => {
    expect(
      buildChatMessagePush({
        recipientRole: "user",
        senderName: "Coach Bình",
        traineeUserId: 10,
        conversationId: 7,
        body: "Nhớ uống nước",
      }),
    ).toEqual({
      title: "Coach Bình",
      body: "Nhớ uống nước",
      url: "/messages/coach",
      tag: "chat-7",
    });
  });

  it("opens the trainee's thread for an admin", () => {
    expect(
      buildChatMessagePush({
        recipientRole: "admin",
        senderName: "An",
        traineeUserId: 10,
        conversationId: 7,
        body: "hi",
      }).url,
    ).toBe("/admin/users/10/messages");
  });

  it("falls back to the app title for a blank sender name", () => {
    expect(
      buildChatMessagePush({
        recipientRole: "user",
        senderName: "  ",
        traineeUserId: 10,
        conversationId: 7,
        body: "hi",
      }).title,
    ).toBe("PT App");
  });
});

describe("buildChatReactionPush", () => {
  const facts = {
    recipientRole: "user" as const,
    reactorName: "Bình",
    emoji: "❤️",
    traineeUserId: 10,
    conversationId: 7,
  };

  it("names the reactor and the emoji, never the message, with its own tag", () => {
    expect(buildChatReactionPush(facts)).toEqual({
      title: "PT App",
      body: "Bình đã thả ❤️ vào tin nhắn của bạn",
      url: "/messages/coach",
      tag: "chat-react-7",
    });
  });

  it("speaks the recipient's language", () => {
    expect(buildChatReactionPush({ ...facts, locale: "en" }).body).toBe(
      "Bình reacted ❤️ to your message",
    );
    expect(buildChatReactionPush({ ...facts, locale: "zh" }).body).toBe(
      "Bình 对你的消息回应了 ❤️",
    );
  });
});

describe("pushContent", () => {
  it("builds the social kinds through the Social builders", () => {
    expect(
      pushContent.social({
        kind: "friend_request",
        actorName: "Lan",
        locale: "en",
        recipientKey: "user:1",
        postId: null,
      }),
    ).toEqual({
      title: "PT App",
      body: "Lan sent you a friend request",
      url: "/friends?tab=requests",
      tag: "social-friend_request",
    });
  });
});
