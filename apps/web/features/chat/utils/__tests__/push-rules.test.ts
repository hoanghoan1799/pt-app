import { describe, expect, it } from "vitest";

import {
  adminOwnerKey,
  buildChatPushPayload,
  buildPushPreview,
  isAllowedPushEndpoint,
  isGoneStatus,
  PUSH_PREVIEW_MAX_LENGTH,
  pushSubscriptionSchema,
  unsubscribeSchema,
  userOwnerKey,
} from "@/features/chat/utils/push-rules";

describe("owner keys", () => {
  it("prefixes the id with the role", () => {
    expect(userOwnerKey(4)).toBe("user:4");
    expect(adminOwnerKey(2)).toBe("admin:2");
  });
});

describe("buildPushPreview", () => {
  it("shows the text as written", () => {
    expect(buildPushPreview({ body: "Mai tập chân nhé" })).toBe(
      "Mai tập chân nhé",
    );
  });

  it("keeps line breaks, collapses spaces and tabs, and trims", () => {
    expect(
      buildPushPreview({ body: "  Chào  \n bạn \t khỏe  \r\nkhông  " }),
    ).toBe("Chào\nbạn khỏe\nkhông");
  });

  it("collapses 3 or more line breaks into 2", () => {
    expect(buildPushPreview({ body: "a\n\n\n\nb\n\nc" })).toBe("a\n\nb\n\nc");
  });

  it("keeps a text of exactly the max length", () => {
    const text = "a".repeat(PUSH_PREVIEW_MAX_LENGTH);

    expect(buildPushPreview({ body: text })).toBe(text);
  });

  it("cuts a longer text to the max length ending with an ellipsis", () => {
    const preview = buildPushPreview({
      body: "a".repeat(PUSH_PREVIEW_MAX_LENGTH + 30),
    });

    expect(preview).toBe(`${"a".repeat(PUSH_PREVIEW_MAX_LENGTH - 1)}…`);
    expect(Array.from(preview)).toHaveLength(PUSH_PREVIEW_MAX_LENGTH);
  });

  it("never splits an emoji when cutting", () => {
    const preview = buildPushPreview({
      body: "💪".repeat(PUSH_PREVIEW_MAX_LENGTH + 5),
    });

    expect(preview).toBe(`${"💪".repeat(PUSH_PREVIEW_MAX_LENGTH - 1)}…`);
    expect(Array.from(preview)).toHaveLength(PUSH_PREVIEW_MAX_LENGTH);
  });

  it("says a photo was sent, even with a caption", () => {
    expect(buildPushPreview({ body: "Bữa trưa", photo: true })).toBe(
      "Đã gửi ảnh",
    );
    expect(buildPushPreview({ photo: true })).toBe("Đã gửi ảnh");
  });

  it("says a sticker was sent", () => {
    expect(buildPushPreview({ body: "", sticker: true })).toBe(
      "Đã gửi sticker",
    );
  });

  it("says a link was sent when the text is only links", () => {
    expect(buildPushPreview({ body: "https://example.com/a?b=1" })).toBe(
      "Đã gửi liên kết",
    );
    expect(
      buildPushPreview({ body: " https://example.com\nwww.example.org " }),
    ).toBe("Đã gửi liên kết");
  });

  it("shows the text when it has a link among other words", () => {
    expect(buildPushPreview({ body: "Xem bài này https://example.com" })).toBe(
      "Xem bài này https://example.com",
    );
  });

  it("falls back for an empty or missing body", () => {
    expect(buildPushPreview({ body: "" })).toBe("Đã gửi tin nhắn");
    expect(buildPushPreview({ body: "  \n " })).toBe("Đã gửi tin nhắn");
    expect(buildPushPreview({ body: null })).toBe("Đã gửi tin nhắn");
    expect(buildPushPreview({})).toBe("Đã gửi tin nhắn");
  });
});

describe("buildChatPushPayload", () => {
  const base = { traineeUserId: 9, conversationId: 5 };

  it("titles the push with the sender and shows the text to the trainee", () => {
    expect(
      buildChatPushPayload({
        ...base,
        recipientRole: "user",
        senderName: "Hoan",
        body: "Mai nhớ uống đủ nước",
      }),
    ).toEqual({
      title: "Hoan",
      body: "Mai nhớ uống đủ nước",
      url: "/messages/coach",
      tag: "chat-5",
    });
  });

  it("titles the push with the trainee and opens that member's chat tab", () => {
    expect(
      buildChatPushPayload({
        ...base,
        recipientRole: "admin",
        senderName: "Lan",
        body: "Em tập xong rồi ạ",
      }),
    ).toEqual({
      title: "Lan",
      body: "Em tập xong rồi ạ",
      url: "/admin/users/9/messages",
      tag: "chat-5",
    });
  });

  it("uses kind labels for a photo and a sticker", () => {
    expect(
      buildChatPushPayload({
        ...base,
        recipientRole: "admin",
        senderName: "Lan",
        body: "caption",
        photo: true,
      }).body,
    ).toBe("Đã gửi ảnh");
    expect(
      buildChatPushPayload({
        ...base,
        recipientRole: "user",
        senderName: "Hoan",
        body: "",
        sticker: true,
      }).body,
    ).toBe("Đã gửi sticker");
  });

  it("falls back to the app name when the sender name is blank", () => {
    expect(
      buildChatPushPayload({
        ...base,
        recipientRole: "user",
        senderName: "  ",
        body: "hi",
      }).title,
    ).toBe("PT App");
  });
});

describe("isGoneStatus", () => {
  it("is true only for 404 and 410", () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
    for (const code of [undefined, 200, 201, 400, 401, 403, 429, 500, 503]) {
      expect(isGoneStatus(code)).toBe(false);
    }
  });
});

describe("pushSubscriptionSchema", () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "BKey", auth: "authKey" },
  };

  it("accepts a browser subscription and ignores extra fields", () => {
    expect(
      pushSubscriptionSchema.parse({ ...valid, expirationTime: null }),
    ).toEqual(valid);
  });

  it.each([
    ["http endpoint", { ...valid, endpoint: "http://push.example/x" }],
    ["not a url", { ...valid, endpoint: "nope" }],
    [
      "endpoint too long",
      { ...valid, endpoint: `https://fcm.googleapis.com/${"a".repeat(2100)}` },
    ],
    ["missing keys", { endpoint: valid.endpoint }],
    ["empty p256dh", { ...valid, keys: { ...valid.keys, p256dh: " " } }],
    ["empty auth", { ...valid, keys: { ...valid.keys, auth: "" } }],
    [
      "auth too long",
      { ...valid, keys: { ...valid.keys, auth: "a".repeat(600) } },
    ],
  ])("rejects %s", (_name, input) => {
    expect(pushSubscriptionSchema.safeParse(input).success).toBe(false);
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/QAbc",
    "https://wns2-db5p.notify.windows.com/w/?token=x",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
  ])("accepts the push service %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["an arbitrary host", "https://attacker.example/hook"],
    ["a lookalike suffix", "https://evilfcm.googleapis.com.attacker.example/x"],
    ["a lookalike prefix", "https://notpush.apple.com.evil/x"],
    ["localhost", "https://localhost/x"],
    ["an IP literal", "https://169.254.169.254/latest/meta-data"],
    ["a custom port", "https://fcm.googleapis.com:8443/fcm/send/abc"],
    ["credentials in the URL", "https://u:p@fcm.googleapis.com/fcm/send/abc"],
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
  ])("rejects %s", (_name, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint,
        keys: { p256dh: "BKey", auth: "authKey" },
      }).success,
    ).toBe(false);
  });
});

describe("unsubscribeSchema", () => {
  it("needs a non-empty endpoint", () => {
    expect(unsubscribeSchema.safeParse({ endpoint: "https://x" }).success).toBe(
      true,
    );
    expect(unsubscribeSchema.safeParse({ endpoint: "" }).success).toBe(false);
    expect(unsubscribeSchema.safeParse({}).success).toBe(false);
  });
});
