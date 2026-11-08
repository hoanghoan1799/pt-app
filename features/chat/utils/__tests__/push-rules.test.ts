import { describe, expect, it } from "vitest";

import {
  adminOwnerKey,
  buildChatPushPayload,
  isAllowedPushEndpoint,
  isGoneStatus,
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

describe("buildChatPushPayload", () => {
  it("says a photo was sent as 📷 Ảnh, never the caption", () => {
    const base = { traineeName: "Lan", traineeUserId: 9, conversationId: 5 };

    expect(
      buildChatPushPayload({ ...base, recipientRole: "user", photo: true })
        .body,
    ).toBe("📷 Ảnh");
    expect(
      buildChatPushPayload({ ...base, recipientRole: "admin", photo: true })
        .body,
    ).toBe("Lan: 📷 Ảnh");
  });

  it("says a sticker was sent, to either side, without any content", () => {
    const base = { traineeName: "Lan", traineeUserId: 9, conversationId: 5 };

    expect(
      buildChatPushPayload({ ...base, recipientRole: "user", sticker: true })
        .body,
    ).toBe("PT đã gửi một sticker");
    expect(
      buildChatPushPayload({ ...base, recipientRole: "admin", sticker: true })
        .body,
    ).toBe("Lan đã gửi một sticker");
  });

  it("tells the trainee only that the PT wrote, and opens their chat", () => {
    expect(
      buildChatPushPayload({
        recipientRole: "user",
        traineeName: "Lan",
        traineeUserId: 9,
        conversationId: 5,
      }),
    ).toEqual({
      title: "PT App",
      body: "Bạn có tin nhắn mới từ PT",
      url: "/messages",
      tag: "chat-5",
    });
  });

  it("tells the admin who wrote, and opens that member's chat tab", () => {
    expect(
      buildChatPushPayload({
        recipientRole: "admin",
        traineeName: "Lan",
        traineeUserId: 9,
        conversationId: 5,
      }),
    ).toEqual({
      title: "PT App",
      body: "Lan vừa nhắn tin",
      url: "/admin/users/9/messages",
      tag: "chat-5",
    });
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
