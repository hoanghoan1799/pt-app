import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  chatConversations,
  chatMessageEdits,
  chatMessages,
  chatReactions,
  users,
} from "@/db/schema";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { CHAT_BODY_MAX_LENGTH } from "@/features/chat/utils/chat-rules";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "user" as "user" | "admin",
  userId: 1,
  adminId: 1,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  publishNewMessage: vi.fn(async () => undefined),
  publishRead: vi.fn(async () => undefined),
  publishChatStatus: vi.fn(async () => undefined),
  publishMessageUpdate: vi.fn(async () => undefined),
}));
vi.mock("@/features/chat/services/chat-push", () => ({
  schedulePush: vi.fn(),
  scheduleReactionPush: vi.fn(),
}));
vi.mock("@/services/api/me", async () => {
  const { fakeAdminMe, fakeUserMe } = await import("@/services/api/testing");

  // GET /v1/auth/me is the only thing faked: the real guards run.
  // /auth/me carries the trainee's chat permission and terms version: read
  // them from the seeded row, as the old legacy merge did.
  const { eq: equals } = await import("drizzle-orm");
  const { users: usersTable } = await import("@/db/schema");
  const userFlags = async (id: number) => {
    const [row] = await (state.db as TestDb)
      .select()
      .from(usersTable)
      .where(equals(usersTable.id, id));

    return {
      chatEnabled: row?.chatEnabled === true,
      termsVersion: row?.termsVersion ?? null,
    };
  };
  return {
    fetchMe: vi.fn(async (role: string) => {
      if (role !== state.role) {
        return null;
      }
      return role === "admin"
        ? fakeAdminMe({ id: state.adminId, username: `pt${state.adminId}` })
        : fakeUserMe({
            ...(await userFlags(state.userId)),
            id: state.userId,
            name: "An",
          });
    }),
  };
});
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({ id, username: `pt${id}` })),
}));
vi.mock("@/services/users", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const { users: usersTable } = await import("@/db/schema");

  return {
    findUserById: vi.fn(async (id: number) => {
      const [row] = await (state.db as TestDb)
        .select()
        .from(usersTable)
        .where(equals(usersTable.id, id));

      return row ?? null;
    }),
  };
});
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const user = await import("@/features/chat/services/chat-actions");
const admin = await import("@/features/chat/services/chat-admin-actions");
const queries = await import("@/features/chat/services/chat-queries");
const realtime = await import("@/features/chat/services/chat-realtime");
const push = await import("@/features/chat/services/chat-push");

let db: TestDb;
let userId: number;
let conversationId: number;
// Messages in the main conversation: by the trainee, by admin 1, by admin 2.
let userMsg: number;
let admin1Msg: number;
let admin2Msg: number;

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const actAs = (role: "user" | "admin", adminId = 1) => {
  state.role = role;
  state.adminId = adminId;
};

const seed = async (
  conversation: number,
  senderRole: "user" | "admin",
  senderAdminId: number | null,
  body: string,
  n: number,
) =>
  (
    await queries.insertMessage({
      conversationId: conversation,
      senderRole,
      senderAdminId,
      body,
      clientId: uuid(n),
    })
  ).id;

const stored = async (id: number) =>
  (await db.select().from(chatMessages).where(eq(chatMessages.id, id)))[0];

const reactionRows = (messageId: number) =>
  db.select().from(chatReactions).where(eq(chatReactions.messageId, messageId));

const conversationRow = async () =>
  (
    await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
  )[0];

beforeEach(async () => {
  vi.clearAllMocks();
  db = await createTestDb();
  state.db = db;
  actAs("user");
  await db.insert(admins).values([
    { username: "pt1", usernameKey: "pt1", passwordHash: "x" },
    { username: "pt2", usernameKey: "pt2", passwordHash: "x" },
  ]);
  const [row] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an", chatEnabled: true })
    .returning({ id: users.id });

  userId = row.id;
  state.userId = userId;
  conversationId = (await queries.getOrCreateConversation(userId)).id;
  userMsg = await seed(conversationId, "user", null, "chào PT", 1);
  admin1Msg = await seed(conversationId, "admin", 1, "chào An", 2);
  admin2Msg = await seed(conversationId, "admin", 2, "PT hai đây", 3);
});

describe("react", () => {
  it("adds, replaces and removes one reaction per reactor", async () => {
    const added = await user.reactMessageAction({
      messageId: admin1Msg,
      emoji: "❤️",
    });

    expect(added.status).toBe("success");
    expect(await reactionRows(admin1Msg)).toMatchObject([
      { reactorKey: "user", emoji: "❤️" },
    ]);

    await user.reactMessageAction({ messageId: admin1Msg, emoji: "💪" });
    expect(await reactionRows(admin1Msg)).toMatchObject([
      { reactorKey: "user", emoji: "💪" },
    ]);

    await user.reactMessageAction({ messageId: admin1Msg, emoji: null });
    expect(await reactionRows(admin1Msg)).toEqual([]);
  });

  it("removes the reaction when the same emoji is sent again", async () => {
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "👍" });
    const again = await user.reactMessageAction({
      messageId: admin1Msg,
      emoji: "👍",
    });

    expect(again.status).toBe("success");
    expect(await reactionRows(admin1Msg)).toEqual([]);
  });

  it("keeps one reaction per reactor: the trainee and each admin react as themselves", async () => {
    await user.reactMessageAction({ messageId: userMsg, emoji: "😂" });
    actAs("admin", 1);
    await admin.adminReactMessageAction({
      conversationId,
      messageId: userMsg,
      emoji: "❤️",
    });
    actAs("admin", 2);
    await admin.adminReactMessageAction({
      conversationId,
      messageId: userMsg,
      emoji: "❤️",
    });

    const rows = await reactionRows(userMsg);

    expect(rows.map((row) => row.reactorKey).sort()).toEqual([
      "admin:1",
      "admin:2",
      "user",
    ]);
    const message = await queries.findMessageById(userMsg);

    expect(message?.reactions).toEqual([
      { emoji: "😂", reactorKey: "user", reactorName: "An" },
      { emoji: "❤️", reactorKey: "admin:1", reactorName: "pt1" },
      { emoji: "❤️", reactorKey: "admin:2", reactorName: "pt2" },
    ]);
  });

  it("rejects an emoji outside the six and stores nothing", async () => {
    const result = await user.reactMessageAction({
      messageId: admin1Msg,
      emoji: "🔥",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.INVALID_INPUT,
    });
    expect(await reactionRows(admin1Msg)).toEqual([]);
    expect(realtime.publishMessageUpdate).not.toHaveBeenCalled();
  });

  it("rejects a reaction to an unsent message", async () => {
    actAs("admin", 1);
    await admin.adminUnsendMessageAction({
      conversationId,
      messageId: admin1Msg,
    });
    actAs("user");
    const result = await user.reactMessageAction({
      messageId: admin1Msg,
      emoji: "❤️",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.MESSAGE_UNSENT,
    });
    expect(await reactionRows(admin1Msg)).toEqual([]);
  });

  it("answers not found for a message of another conversation", async () => {
    const [other] = await db
      .insert(users)
      .values({ name: "Binh", nameKey: "binh", chatEnabled: true })
      .returning({ id: users.id });
    const otherConversation = await queries.getOrCreateConversation(other.id);
    const foreign = await seed(otherConversation.id, "admin", 1, "riêng", 9);
    const result = await user.reactMessageAction({
      messageId: foreign,
      emoji: "❤️",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.MESSAGE_NOT_FOUND,
    });
    expect(await reactionRows(foreign)).toEqual([]);
  });

  it("is blocked while chat is locked for the trainee", async () => {
    await db.update(users).set({ chatEnabled: false });
    const result = await user.reactMessageAction({
      messageId: admin1Msg,
      emoji: "❤️",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.CHAT_LOCKED,
    });
  });

  it("stamps the message and the conversation and publishes ids only", async () => {
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "❤️" });

    const row = await stored(admin1Msg);
    const conversation = await conversationRow();

    expect(row.updatedAt).toBeInstanceOf(Date);
    expect(conversation.lastChangeAt?.getTime()).toBe(row.updatedAt?.getTime());
    expect(realtime.publishMessageUpdate).toHaveBeenCalledExactlyOnceWith(
      conversationId,
      admin1Msg,
    );
  });

  it("makes the change cursor strictly increase, even within one millisecond", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
    try {
      await user.reactMessageAction({ messageId: admin1Msg, emoji: "❤️" });
      const first = (await conversationRow()).lastChangeAt?.getTime() ?? 0;

      await user.reactMessageAction({ messageId: admin1Msg, emoji: null });
      const second = (await conversationRow()).lastChangeAt?.getTime() ?? 0;

      expect(second).toBe(first + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not stamp or publish when removing a reaction that does not exist", async () => {
    await user.reactMessageAction({ messageId: admin1Msg, emoji: null });

    expect((await stored(admin1Msg)).updatedAt).toBeNull();
    expect(realtime.publishMessageUpdate).not.toHaveBeenCalled();
  });
});

describe("reaction push", () => {
  it("pushes the admin author once when the trainee reacts, without the message text", async () => {
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "❤️" });

    expect(push.scheduleReactionPush).toHaveBeenCalledExactlyOnceWith({
      recipient: { role: "admin", adminId: 1 },
      reactorName: "An",
      reactorKey: "user:1",
      emoji: "❤️",
      traineeUserId: userId,
      conversationId,
    });
  });

  it("pushes the trainee when an admin reacts to the trainee's message", async () => {
    actAs("admin", 2);
    await admin.adminReactMessageAction({
      conversationId,
      messageId: userMsg,
      emoji: "💪",
    });

    expect(push.scheduleReactionPush).toHaveBeenCalledExactlyOnceWith({
      recipient: { role: "user", userId },
      reactorName: "pt2",
      reactorKey: "admin:2",
      emoji: "💪",
      traineeUserId: userId,
      conversationId,
    });
  });

  it("pushes the other admin when one admin reacts to another's message", async () => {
    actAs("admin", 1);
    await admin.adminReactMessageAction({
      conversationId,
      messageId: admin2Msg,
      emoji: "👍",
    });

    expect(push.scheduleReactionPush).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        recipient: { role: "admin", adminId: 2 },
        reactorName: "pt1",
      }),
    );
  });

  it("pushes again when the emoji is replaced", async () => {
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "❤️" });
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "😮" });

    expect(push.scheduleReactionPush).toHaveBeenCalledTimes(2);
    expect(push.scheduleReactionPush).toHaveBeenLastCalledWith(
      expect.objectContaining({ emoji: "😮" }),
    );
  });

  it("does not push when removing, by null or by the same emoji", async () => {
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "❤️" });
    vi.mocked(push.scheduleReactionPush).mockClear();

    await user.reactMessageAction({ messageId: admin1Msg, emoji: "❤️" });
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "👍" });
    vi.mocked(push.scheduleReactionPush).mockClear();
    await user.reactMessageAction({ messageId: admin1Msg, emoji: null });

    expect(push.scheduleReactionPush).not.toHaveBeenCalled();
  });

  it("never pushes yourself: trainee on own message, admin on own message", async () => {
    await user.reactMessageAction({ messageId: userMsg, emoji: "❤️" });
    actAs("admin", 1);
    await admin.adminReactMessageAction({
      conversationId,
      messageId: admin1Msg,
      emoji: "❤️",
    });

    expect(push.scheduleReactionPush).not.toHaveBeenCalled();
    expect(await reactionRows(userMsg)).toHaveLength(1);
    expect(await reactionRows(admin1Msg)).toHaveLength(1);
  });

  it("sends no push for edits and unsends", async () => {
    await user.editMessageAction({ messageId: userMsg, body: "sửa" });
    await user.unsendMessageAction({ messageId: userMsg });

    expect(push.scheduleReactionPush).not.toHaveBeenCalled();
    expect(push.schedulePush).not.toHaveBeenCalled();
  });
});

describe("edit", () => {
  it("edits the trainee's own message and keeps the previous body", async () => {
    const result = await user.editMessageAction({
      messageId: userMsg,
      body: "  chào PT nhé  ",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.message).toMatchObject({
      id: userMsg,
      body: "chào PT nhé",
      deleted: false,
    });
    expect(result.message.editedAt).toBeInstanceOf(Date);
    const history = await db.select().from(chatMessageEdits);

    expect(history).toMatchObject([
      { messageId: userMsg, previousBody: "chào PT" },
    ]);
    expect((await stored(userMsg)).body).toBe("chào PT nhé");
    expect(realtime.publishMessageUpdate).toHaveBeenCalledExactlyOnceWith(
      conversationId,
      userMsg,
    );
  });

  it("keeps every previous body in order across several edits", async () => {
    await user.editMessageAction({ messageId: userMsg, body: "hai" });
    await user.editMessageAction({ messageId: userMsg, body: "ba" });

    const history = await queries.listEditHistory(userMsg);

    expect(history.map((row) => row.previousBody)).toEqual(["chào PT", "hai"]);
  });

  it("lets an admin edit their own message only", async () => {
    actAs("admin", 1);
    const own = await admin.adminEditMessageAction({
      conversationId,
      messageId: admin1Msg,
      body: "chào An nhé",
    });

    expect(own.status).toBe("success");
    expect((await stored(admin1Msg)).body).toBe("chào An nhé");
  });

  it("rejects the trainee editing an admin message", async () => {
    const result = await user.editMessageAction({
      messageId: admin1Msg,
      body: "hack",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.NOT_YOUR_MESSAGE,
    });
    expect((await stored(admin1Msg)).body).toBe("chào An");
    expect(await db.select().from(chatMessageEdits)).toEqual([]);
  });

  it("rejects an admin editing another admin's message", async () => {
    actAs("admin", 1);
    const result = await admin.adminEditMessageAction({
      conversationId,
      messageId: admin2Msg,
      body: "hack",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.NOT_YOUR_MESSAGE,
    });
    expect((await stored(admin2Msg)).body).toBe("PT hai đây");
  });

  it("rejects an admin editing the trainee's message", async () => {
    actAs("admin", 1);
    const result = await admin.adminEditMessageAction({
      conversationId,
      messageId: userMsg,
      body: "hack",
    });

    expect(result.status).toBe("error");
    expect((await stored(userMsg)).body).toBe("chào PT");
  });

  it("rejects editing an unsent message", async () => {
    await user.unsendMessageAction({ messageId: userMsg });
    const result = await user.editMessageAction({
      messageId: userMsg,
      body: "lại",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.MESSAGE_UNSENT,
    });
    expect(await db.select().from(chatMessageEdits)).toEqual([]);
  });

  it("validates the body like a send: trimmed, not empty, not too long", async () => {
    for (const body of ["   ", "", "x".repeat(CHAT_BODY_MAX_LENGTH + 1)]) {
      const result = await user.editMessageAction({
        messageId: userMsg,
        body,
      });

      expect(result).toEqual({
        status: "error",
        message: CHAT_MESSAGES.INVALID_INPUT,
      });
    }
    const longest = "x".repeat(CHAT_BODY_MAX_LENGTH);

    expect(
      (await user.editMessageAction({ messageId: userMsg, body: longest }))
        .status,
    ).toBe("success");
  });

  it("treats saving the same text as a no-op: no history, no marker, no publish", async () => {
    const result = await user.editMessageAction({
      messageId: userMsg,
      body: " chào PT ",
    });

    expect(result.status).toBe("success");
    expect(await db.select().from(chatMessageEdits)).toEqual([]);
    expect((await stored(userMsg)).editedAt).toBeNull();
    expect(realtime.publishMessageUpdate).not.toHaveBeenCalled();
  });

  it("answers not found for a message of another conversation", async () => {
    const [other] = await db
      .insert(users)
      .values({ name: "Binh", nameKey: "binh", chatEnabled: true })
      .returning({ id: users.id });
    const otherConversation = await queries.getOrCreateConversation(other.id);
    const foreign = await seed(otherConversation.id, "user", null, "riêng", 9);
    const result = await user.editMessageAction({
      messageId: foreign,
      body: "hack",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.MESSAGE_NOT_FOUND,
    });
    expect((await stored(foreign)).body).toBe("riêng");
  });

  it("rejects an admin addressing a message through the wrong conversation", async () => {
    const [other] = await db
      .insert(users)
      .values({ name: "Binh", nameKey: "binh", chatEnabled: true })
      .returning({ id: users.id });
    const otherConversation = await queries.getOrCreateConversation(other.id);

    actAs("admin", 1);
    const result = await admin.adminEditMessageAction({
      conversationId: otherConversation.id,
      messageId: admin1Msg,
      body: "hack",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.MESSAGE_NOT_FOUND,
    });
  });

  it("answers an unknown conversation for an admin", async () => {
    actAs("admin", 1);
    const result = await admin.adminEditMessageAction({
      conversationId: 9999,
      messageId: admin1Msg,
      body: "x",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.CONVERSATION_NOT_FOUND,
    });
  });
});

describe("unsend", () => {
  it("unsends the trainee's own message and returns an empty body", async () => {
    const result = await user.unsendMessageAction({ messageId: userMsg });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.message).toMatchObject({
      id: userMsg,
      body: "",
      deleted: true,
      reactions: [],
    });
    expect((await stored(userMsg)).deletedAt).toBeInstanceOf(Date);
    // History keeps the row (D8).
    expect((await stored(userMsg)).body).toBe("chào PT");
    expect(realtime.publishMessageUpdate).toHaveBeenCalledExactlyOnceWith(
      conversationId,
      userMsg,
    );
  });

  it("is idempotent: a second unsend succeeds without a second change", async () => {
    await user.unsendMessageAction({ messageId: userMsg });
    const cursor = (await conversationRow()).lastChangeAt;
    const again = await user.unsendMessageAction({ messageId: userMsg });

    expect(again.status).toBe("success");
    expect((await conversationRow()).lastChangeAt).toEqual(cursor);
    expect(realtime.publishMessageUpdate).toHaveBeenCalledTimes(1);
  });

  it("lets an admin unsend their own message", async () => {
    actAs("admin", 2);
    const result = await admin.adminUnsendMessageAction({
      conversationId,
      messageId: admin2Msg,
    });

    expect(result.status).toBe("success");
    expect((await stored(admin2Msg)).deletedAt).toBeInstanceOf(Date);
  });

  it("rejects unsending someone else's message", async () => {
    const byUser = await user.unsendMessageAction({ messageId: admin1Msg });

    actAs("admin", 1);
    const byOtherAdmin = await admin.adminUnsendMessageAction({
      conversationId,
      messageId: admin2Msg,
    });
    const ofTrainee = await admin.adminUnsendMessageAction({
      conversationId,
      messageId: userMsg,
    });

    for (const result of [byUser, byOtherAdmin, ofTrainee]) {
      expect(result).toEqual({
        status: "error",
        message: CHAT_MESSAGES.NOT_YOUR_MESSAGE,
      });
    }
    expect(
      (
        await db
          .select()
          .from(chatMessages)
          .where(and(eq(chatMessages.conversationId, conversationId)))
      ).filter((row) => row.deletedAt !== null),
    ).toEqual([]);
  });

  it("hides reactions on an unsent message", async () => {
    await user.reactMessageAction({ messageId: admin1Msg, emoji: "❤️" });
    actAs("admin", 1);
    await admin.adminUnsendMessageAction({
      conversationId,
      messageId: admin1Msg,
    });

    const message = await queries.findMessageById(admin1Msg);

    expect(message).toMatchObject({ deleted: true, body: "", reactions: [] });
  });
});

describe("reply", () => {
  it("stores a reply to a message of the same conversation", async () => {
    const result = await user.sendMessageAction({
      body: "trả lời",
      clientId: uuid(20),
      replyToMessageId: admin1Msg,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.message.replyTo).toEqual({
      id: admin1Msg,
      body: "chào An",
      isSticker: false,
      isPhoto: false,
      senderRole: "admin",
      deleted: false,
    });
  });

  it("lets an admin reply to the trainee's message", async () => {
    actAs("admin", 1);
    const result = await user.adminSendMessageAction({
      userId,
      body: "ok",
      clientId: uuid(21),
      replyToMessageId: userMsg,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.message.replyTo?.id).toBe(userMsg);
    }
  });

  it("rejects an unknown reply target and stores nothing", async () => {
    const result = await user.sendMessageAction({
      body: "trả lời",
      clientId: uuid(20),
      replyToMessageId: 99999,
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.INVALID_INPUT,
    });
    expect(await db.select().from(chatMessages)).toHaveLength(3);
    expect(push.schedulePush).not.toHaveBeenCalled();
  });

  it("rejects a reply target from another conversation, for both roles", async () => {
    const [other] = await db
      .insert(users)
      .values({ name: "Binh", nameKey: "binh", chatEnabled: true })
      .returning({ id: users.id });
    const otherConversation = await queries.getOrCreateConversation(other.id);
    const foreign = await seed(otherConversation.id, "user", null, "riêng", 9);
    const asUser = await user.sendMessageAction({
      body: "x",
      clientId: uuid(20),
      replyToMessageId: foreign,
    });

    actAs("admin", 1);
    const asAdmin = await user.adminSendMessageAction({
      userId,
      body: "x",
      clientId: uuid(21),
      replyToMessageId: foreign,
    });

    for (const result of [asUser, asAdmin]) {
      expect(result).toEqual({
        status: "error",
        message: CHAT_MESSAGES.INVALID_INPUT,
      });
    }
  });

  it("rejects a non-positive reply id", async () => {
    const result = await user.sendMessageAction({
      body: "x",
      clientId: uuid(20),
      replyToMessageId: 0,
    });

    expect(result.status).toBe("error");
  });
});

describe("payload shape", () => {
  it("gives a reply snippet cut at 120 characters", async () => {
    const long = await seed(conversationId, "admin", 1, "a".repeat(300), 30);
    const result = await user.sendMessageAction({
      body: "r",
      clientId: uuid(31),
      replyToMessageId: long,
    });

    expect(result.status === "success" && result.message.replyTo?.body).toBe(
      "a".repeat(120),
    );
  });

  it("shows an empty snippet and deleted=true when the original is unsent", async () => {
    const reply = await user.sendMessageAction({
      body: "trả lời",
      clientId: uuid(20),
      replyToMessageId: admin1Msg,
    });

    actAs("admin", 1);
    await admin.adminUnsendMessageAction({
      conversationId,
      messageId: admin1Msg,
    });
    const id = reply.status === "success" ? reply.message.id : 0;
    const message = await queries.findMessageById(id);

    expect(message?.replyTo).toEqual({
      id: admin1Msg,
      body: "",
      isSticker: false,
      isPhoto: false,
      senderRole: "admin",
      deleted: true,
    });
  });

  it("lists plain messages with no reply, no edit, not deleted, no reactions", async () => {
    const { messages } = await queries.listMessages(conversationId);

    expect(messages).toHaveLength(3);
    for (const message of messages) {
      expect(message).toMatchObject({
        replyTo: null,
        editedAt: null,
        deleted: false,
        reactions: [],
      });
      expect(message.updatedAt).toEqual(message.createdAt);
    }
  });

  it("returns an unsent message with an empty body in the thread", async () => {
    await user.unsendMessageAction({ messageId: userMsg });
    const { messages } = await queries.listMessages(conversationId);
    const unsent = messages.find((message) => message.id === userMsg);

    expect(unsent).toMatchObject({ body: "", deleted: true, replyTo: null });
    expect(messages.find((m) => m.id === admin1Msg)?.body).toBe("chào An");
  });

  it("shows an unsent last message with an empty inbox preview", async () => {
    await user.unsendMessageAction({ messageId: userMsg });
    actAs("admin", 2);
    await admin.adminUnsendMessageAction({
      conversationId,
      messageId: admin2Msg,
    });
    const inbox = await queries.listAdminInbox(1);

    expect(inbox.conversations[0].preview).toBe("");
  });
});

describe("edit history", () => {
  it("is loadable by message, newest edit last, and empty once unsent", async () => {
    const { loadEditHistory } =
      await import("@/features/chat/services/chat-thread");

    await user.editMessageAction({ messageId: userMsg, body: "hai" });

    expect(await loadEditHistory(conversationId, userMsg)).toMatchObject([
      { previousBody: "chào PT" },
    ]);
    expect(await loadEditHistory(conversationId, 99999)).toBeNull();
    expect(await loadEditHistory(conversationId + 1, userMsg)).toBeNull();

    await user.unsendMessageAction({ messageId: userMsg });
    expect(await loadEditHistory(conversationId, userMsg)).toEqual([]);
  });
});
