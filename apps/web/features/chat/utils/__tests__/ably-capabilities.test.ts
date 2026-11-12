import { describe, expect, it } from "vitest";

import {
  ABLY_TOKEN_TTL_MS,
  adminCapability,
  adminClientId,
  CHAT_EVENTS,
  chatStatusEvent,
  conversationChannel,
  dmConversationChannel,
  dmEvent,
  INBOX_CHANNEL,
  inboxEvent,
  messageEvent,
  messageUpdateEvent,
  readEvent,
  traineeCapability,
  traineeClientId,
  typingEvent,
  userChannel,
} from "@/features/chat/utils/ably-capabilities";

describe("channel names", () => {
  it("builds names under the chat: prefix", () => {
    expect(conversationChannel(5)).toBe("chat:conversation:5");
    expect(userChannel(3)).toBe("chat:user:3");
    expect(INBOX_CHANNEL).toBe("chat:inbox");
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid id %s", (id) => {
    expect(() => conversationChannel(id)).toThrow();
    expect(() => userChannel(id)).toThrow();
    expect(() => traineeClientId(id)).toThrow();
    expect(() => adminClientId(id)).toThrow();
  });
});

describe("capabilities", () => {
  it("gives a trainee subscribe on own channels only", () => {
    expect(traineeCapability(3, 5)).toEqual({
      "chat:conversation:5": ["subscribe"],
      "chat:user:3": ["subscribe"],
    });
  });

  it("gives an admin subscribe on all conversations and the inbox", () => {
    expect(adminCapability()).toEqual({
      "chat:conversation:*": ["subscribe"],
      "chat:inbox": ["subscribe"],
    });
  });

  it("limits a PT to the listed conversations plus the inbox", () => {
    expect(adminCapability([4, 9])).toEqual({
      "chat:conversation:4": ["subscribe"],
      "chat:conversation:9": ["subscribe"],
      "chat:inbox": ["subscribe"],
    });
  });

  it("never grants publish, presence or history; all names start with chat:", () => {
    for (const capability of [traineeCapability(3, 5), adminCapability()]) {
      const json = JSON.stringify(capability);

      expect(json).not.toContain("publish");
      expect(json).not.toContain("presence");
      expect(json).not.toContain("history");
      Object.keys(capability).forEach((name) =>
        expect(name.startsWith("chat:")).toBe(true),
      );
    }
  });

  it("builds client ids and a 15 minute ttl", () => {
    expect(traineeClientId(3)).toBe("user:3");
    expect(adminClientId(7)).toBe("admin:7");
    expect(ABLY_TOKEN_TTL_MS).toBe(900000);
  });
});

describe("event payloads", () => {
  it("exposes event names", () => {
    expect(CHAT_EVENTS).toEqual({
      MESSAGE: "message",
      MESSAGE_UPDATE: "message-update",
      PROFILE_UPDATE: "profile-update",
      READ: "read",
      CHAT_STATUS: "chat-status",
      INBOX: "inbox",
      TYPING: "typing",
    });
  });

  it("publishes message updates with ids only", () => {
    expect(messageUpdateEvent(5, 9)).toEqual({
      conversationId: 5,
      messageId: 9,
    });
    expect(() => messageUpdateEvent(0, 9)).toThrow();
  });

  it("passes only public message fields", () => {
    const createdAt = new Date("2026-11-04T10:00:00.000Z");
    const event = messageEvent({
      id: 9,
      conversationId: 5,
      senderRole: "admin",
      senderAdminId: 7,
      body: "hi",
      clientId: "c1",
      createdAt,
      // @ts-expect-error extra fields must not leak
      senderAdminName: "pt",
    });

    expect(event).toEqual({
      id: 9,
      conversationId: 5,
      senderRole: "admin",
      senderAdminId: 7,
      body: "hi",
      clientId: "c1",
      createdAt: "2026-11-04T10:00:00.000Z",
    });
  });

  it("builds read, status and inbox payloads without a body", () => {
    expect(readEvent("user", 4)).toEqual({
      readerKey: "user",
      lastReadMessageId: 4,
    });
    expect(chatStatusEvent(false)).toEqual({ enabled: false });
    expect(inboxEvent(5, 9, "user")).toEqual({
      conversationId: 5,
      messageId: 9,
      senderRole: "user",
    });
    expect(() => inboxEvent(0, 9, "user")).toThrow();
  });
});

describe("typing event", () => {
  it("carries only the role and sender key", () => {
    expect(typingEvent("user", "user:3")).toEqual({
      role: "user",
      senderKey: "user:3",
    });
  });
});

describe("trainee chat (dm) channels", () => {
  it("lives under chat:dm:conversation:<id>", () => {
    expect(dmConversationChannel(7)).toBe("chat:dm:conversation:7");
    expect(() => dmConversationChannel(0)).toThrow();
  });

  it("subscribes a trainee to their own dm conversations only, no wildcard", () => {
    const capability = traineeCapability(3, 5, [7, 9]);

    expect(capability).toEqual({
      "chat:conversation:5": ["subscribe"],
      "chat:user:3": ["subscribe"],
      "chat:dm:conversation:7": ["subscribe"],
      "chat:dm:conversation:9": ["subscribe"],
    });
    for (const [channel, operations] of Object.entries(capability)) {
      expect(channel).not.toContain("*");
      expect(operations).toEqual(["subscribe"]);
    }
  });

  it("adds nothing without dm conversations", () => {
    expect(Object.keys(traineeCapability(3, 5))).toHaveLength(2);
  });

  it("an event carries ids only", () => {
    expect(dmEvent(1, 2, 3)).toEqual({
      conversationId: 1,
      messageId: 2,
      senderId: 3,
    });
  });
});
