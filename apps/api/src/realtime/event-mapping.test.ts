import { describe, expect, it } from "vitest";

import type {
  ChatMessageSentEvent,
  ChatReactionChangedEvent,
} from "../chat/chat.events.js";
import {
  mapDmDeleted,
  mapDmRead,
  mapMessageSent,
  mapMessageUpdated,
  mapProfileChanged,
  mapRead,
  mapStatusChanged,
} from "./event-mapping.js";

const sent: ChatMessageSentEvent = {
  conversationId: 7,
  traineeUserId: 10,
  messageId: 55,
  clientId: "11111111-1111-4111-8111-111111111111",
  senderRole: "user",
  senderAdminId: null,
  silent: false,
  body: "secret text",
  hasSticker: false,
  hasPhoto: false,
  replyToMessageId: null,
};

describe("chat.message.sent", () => {
  const [message, inbox] = mapMessageSent(sent, 3);

  it("becomes `message` in the conversation room with ids and no text", () => {
    expect(message).toEqual({
      event: "message",
      data: {
        id: 55,
        conversationId: 7,
        senderRole: "user",
        senderAdminId: null,
        clientId: "11111111-1111-4111-8111-111111111111",
      },
      rooms: ["conv:7"],
      guardTraineeUserId: 10,
      joinTraineeUserId: { userId: 10, conversationId: 7 },
    });
    expect(JSON.stringify(mapMessageSent(sent, 3))).not.toContain("secret");
  });

  it("becomes `inbox` for the super admins and the trainee's PT", () => {
    expect(inbox).toEqual({
      event: "inbox",
      data: { conversationId: 7, messageId: 55, senderRole: "user" },
      rooms: ["inbox:super", "inbox:pt:3"],
      guardTraineeUserId: 10,
    });
  });

  it("reaches only the super admins when the trainee has no PT", () => {
    expect(mapMessageSent(sent, null)[1].rooms).toEqual(["inbox:super"]);
  });

  it("names the sending admin on an admin message", () => {
    const [adminMessage] = mapMessageSent(
      { ...sent, senderRole: "admin", senderAdminId: 3 },
      3,
    );

    expect(adminMessage.data).toMatchObject({
      senderRole: "admin",
      senderAdminId: 3,
    });
  });
});

describe("edits, unsends and reactions", () => {
  it("become `message-update` with the ids only", () => {
    const reaction: ChatReactionChangedEvent = {
      conversationId: 7,
      traineeUserId: 10,
      messageId: 55,
      changedAt: 1,
      reactorKey: "user",
      reactorName: "An",
      emoji: "❤️",
      previousEmoji: null,
      authorRole: "admin",
      authorAdminId: 3,
    };

    expect(mapMessageUpdated(reaction)).toEqual([
      {
        event: "message-update",
        data: { conversationId: 7, messageId: 55 },
        rooms: ["conv:7"],
        guardTraineeUserId: 10,
      },
    ]);
  });
});

describe("read, profile and status", () => {
  it("maps a read cursor", () => {
    expect(
      mapRead({
        conversationId: 7,
        traineeUserId: 10,
        readerKey: "admin:3",
        lastReadMessageId: 55,
      }),
    ).toEqual([
      {
        event: "read",
        data: {
          conversationId: 7,
          readerKey: "admin:3",
          lastReadMessageId: 55,
        },
        rooms: ["conv:7"],
        guardTraineeUserId: 10,
      },
    ]);
  });

  it("maps a nickname or colour change", () => {
    expect(
      mapProfileChanged({ conversationId: 7, traineeUserId: 10, changedAt: 9 }),
    ).toEqual([
      {
        event: "profile-update",
        data: { conversationId: 7 },
        rooms: ["conv:7"],
        guardTraineeUserId: 10,
      },
    ]);
  });

  it("tells the trainee and the conversation about the chat switch", () => {
    expect(
      mapStatusChanged({ userId: 10, conversationId: 7, enabled: false })[0],
    ).toMatchObject({
      event: "chat-status",
      data: { enabled: false },
      rooms: ["user:10", "conv:7"],
    });
  });

  it("tells only the trainee when there is no conversation yet", () => {
    expect(
      mapStatusChanged({ userId: 10, conversationId: null, enabled: true })[0]
        .rooms,
    ).toEqual(["user:10"]);
  });
});

describe("trainee chats", () => {
  it("maps an unsend to `dm:update` for the two members", () => {
    expect(
      mapDmDeleted({ conversationId: 4, messageId: 8, senderId: 10 }),
    ).toEqual([
      {
        event: "dm:update",
        data: { conversationId: 4, messageId: 8, senderId: 10 },
        rooms: ["dm:4"],
      },
    ]);
  });

  it("maps a read to `dm:read`", () => {
    expect(
      mapDmRead({ conversationId: 4, userId: 10, lastReadMessageId: 8 }),
    ).toEqual([
      {
        event: "dm:read",
        data: { conversationId: 4, userId: 10, lastReadMessageId: 8 },
        rooms: ["dm:4"],
      },
    ]);
  });
});
