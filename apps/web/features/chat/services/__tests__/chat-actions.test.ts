import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { chatMessages, chatPhotos, chatReads, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "user" as "user" | "admin",
  userId: 1,
  adminId: 7,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  publishNewMessage: vi.fn(async () => undefined),
  publishRead: vi.fn(async () => undefined),
  publishChatStatus: vi.fn(async () => undefined),
}));
vi.mock("@/features/chat/services/chat-push", () => ({
  schedulePush: vi.fn(),
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
        ? fakeAdminMe({ id: state.adminId, username: "pt" })
        : fakeUserMe({ ...(await userFlags(state.userId)), id: state.userId });
    }),
  };
});
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({ id, username: "pt" })),
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

const { CHAT_MESSAGES } = await import("@/features/chat/constants/messages");
const actions = await import("@/features/chat/services/chat-actions");
const queries = await import("@/features/chat/services/chat-queries");
const realtime = await import("@/features/chat/services/chat-realtime");
const chatPush = await import("@/features/chat/services/chat-push");

let db: TestDb;
let userId: number;

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const addUser = async (name: string, chatEnabled: boolean | null) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name.toLowerCase(), chatEnabled })
    .returning({ id: users.id });

  return row.id;
};

// A pending upload as /api/chat/photos leaves it, ready to be attached.
const addPendingPhoto = async (uploaderKey: string) => {
  const conversation = await queries.getOrCreateConversation(userId);
  const [photo] = await db
    .insert(chatPhotos)
    .values({
      conversationId: conversation.id,
      uploaderKey,
      mime: "image/png",
      width: 1,
      height: 1,
      data: Buffer.from([0]),
      size: 1,
      createdAt: new Date(),
    })
    .returning({ id: chatPhotos.id });

  return photo.id;
};

const rows = () => db.select().from(chatMessages);

beforeEach(async () => {
  vi.mocked(chatPush.schedulePush).mockClear();
  db = await createTestDb();
  state.db = db;
  state.role = "user";
  state.adminId = 7;
  userId = await addUser("An", true);
  state.userId = userId;
});

describe("sendMessageAction", () => {
  it("stores the message and updates the conversation", async () => {
    const result = await actions.sendMessageAction({
      body: "  Chào PT  ",
      clientId: uuid(1),
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.message).toMatchObject({
      senderRole: "user",
      senderAdminId: null,
      senderAdminName: null,
      body: "Chào PT",
      clientId: uuid(1),
    });
    const conversation = await queries.findConversationByUserId(userId);

    expect(conversation?.lastMessageId).toBe(result.message.id);
    expect(conversation?.lastMessageAt).toBeInstanceOf(Date);
    expect(realtime.publishNewMessage).toHaveBeenCalledExactlyOnceWith(
      conversation?.id,
      result.message,
    );
  });

  it("is idempotent: the same clientId twice stores one row", async () => {
    const first = await actions.sendMessageAction({
      body: "một",
      clientId: uuid(1),
    });
    const second = await actions.sendMessageAction({
      body: "một",
      clientId: uuid(1),
    });

    expect(await rows()).toHaveLength(1);
    expect(first.status).toBe("success");
    expect(second).toEqual(first);
  });

  it("schedules one push for a new message, none for a retried clientId", async () => {
    const input = { body: "một", clientId: uuid(1) };

    await actions.sendMessageAction(input);
    await actions.sendMessageAction(input);

    expect(chatPush.schedulePush).toHaveBeenCalledTimes(1);
    expect(chatPush.schedulePush).toHaveBeenCalledWith({
      senderRole: "user",
      traineeUserId: userId,
      conversationId: expect.any(Number),
      body: "một",
    });
  });

  it("strips /imlang, stores the rest and sends no push", async () => {
    const result = await actions.sendMessageAction({
      body: "/imlang hi",
      clientId: uuid(1),
    });

    expect(result.status).toBe("success");
    expect((await rows()).map((row) => row.body)).toEqual(["hi"]);
    expect(realtime.publishNewMessage).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ body: "hi" }),
    );
    expect(chatPush.schedulePush).not.toHaveBeenCalled();
  });

  it("sends a photo with caption /imlang hi as caption hi, no push", async () => {
    const photoId = await addPendingPhoto("user");
    const result = await actions.sendMessageAction({
      photoId,
      body: "/imlang hi",
      clientId: uuid(1),
    });

    expect(result.status).toBe("success");
    const [stored] = await rows();
    const [photo] = await db.select().from(chatPhotos);

    expect(stored.body).toBe("hi");
    expect(stored.photoId).toBe(photoId);
    expect(photo.messageId).toBe(stored.id);
    expect(chatPush.schedulePush).not.toHaveBeenCalled();
  });

  it("sends a photo captioned only /imlang silently with no caption", async () => {
    const photoId = await addPendingPhoto("user");
    const result = await actions.sendMessageAction({
      photoId,
      body: "/imlang",
      clientId: uuid(1),
    });

    expect(result.status).toBe("success");
    const [stored] = await rows();

    expect(stored.body).toBe("");
    expect(stored.photoId).toBe(photoId);
    expect(chatPush.schedulePush).not.toHaveBeenCalled();
  });

  it("rejects /imlang alone as invalid input", async () => {
    const result = await actions.sendMessageAction({
      body: "/imlang",
      clientId: uuid(1),
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.INVALID_INPUT,
    });
    expect(await rows()).toHaveLength(0);
    expect(chatPush.schedulePush).not.toHaveBeenCalled();
  });

  it("keeps an unknown command as plain text and pushes", async () => {
    await actions.sendMessageAction({ body: "/abc hi", clientId: uuid(1) });

    expect((await rows()).map((row) => row.body)).toEqual(["/abc hi"]);
    expect(chatPush.schedulePush).toHaveBeenCalledTimes(1);
  });

  it.each([null, false])("rejects chatEnabled %s", async (flag) => {
    const lockedId = await addUser(`Binh${String(flag)}`, flag);

    state.userId = lockedId;
    const result = await actions.sendMessageAction({
      body: "hi",
      clientId: uuid(2),
    });

    expect(result).toEqual({
      status: "error",
      message: "PT đã tạm khoá nhắn tin",
    });
    expect(await rows()).toHaveLength(0);
    expect(await queries.findConversationByUserId(lockedId)).toBeNull();
  });

  it.each([
    ["empty body", { body: "   ", clientId: uuid(3) }],
    ["bad uuid", { body: "hi", clientId: "nope" }],
    ["too long", { body: "a".repeat(2001), clientId: uuid(3) }],
  ])("rejects invalid input: %s", async (_name, input) => {
    const result = await actions.sendMessageAction(input);

    expect(result).toEqual({
      status: "error",
      message: "Tin nhắn không hợp lệ",
    });
    expect(await rows()).toHaveLength(0);
  });

  it("has no send limit (D13): 25 messages in a row are all stored", async () => {
    for (let i = 1; i <= 25; i++) {
      const result = await actions.sendMessageAction({
        body: `tin ${i}`,
        clientId: uuid(i),
      });

      expect(result.status).toBe("success");
    }
    expect(await rows()).toHaveLength(25);
  });

  it("never uses a conversation id from the client", async () => {
    const otherId = await addUser("Cuong", true);
    const other = await queries.getOrCreateConversation(otherId);

    await actions.sendMessageAction({
      body: "của tôi",
      clientId: uuid(1),
      conversationId: other.id,
    } as never);

    const mine = await queries.findConversationByUserId(userId);

    expect(await rows()).toMatchObject([{ conversationId: mine?.id }]);
    expect(mine?.id).not.toBe(other.id);
  });
});

describe("adminSendMessageAction", () => {
  beforeEach(() => {
    state.role = "admin";
  });

  it("sends as the admin with the admin name", async () => {
    const result = await actions.adminSendMessageAction({
      userId,
      body: "Chào An",
      clientId: uuid(1),
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.message).toMatchObject({
      senderRole: "admin",
      senderAdminId: 7,
      body: "Chào An",
    });
  });

  it("strips /imlang, stores the rest and sends no push", async () => {
    const result = await actions.adminSendMessageAction({
      userId,
      body: "/imlang hi",
      clientId: uuid(1),
    });

    expect(result.status).toBe("success");
    expect((await rows()).map((row) => row.body)).toEqual(["hi"]);
    expect(realtime.publishNewMessage).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ body: "hi" }),
    );
    expect(chatPush.schedulePush).not.toHaveBeenCalled();
  });

  it("sends a photo with caption /imlang hi as caption hi, no push", async () => {
    const photoId = await addPendingPhoto("admin:7");
    const result = await actions.adminSendMessageAction({
      userId,
      photoId,
      body: "/imlang hi",
      clientId: uuid(1),
    });

    expect(result.status).toBe("success");
    const [stored] = await rows();

    expect(stored.body).toBe("hi");
    expect(stored.photoId).toBe(photoId);
    expect(chatPush.schedulePush).not.toHaveBeenCalled();
  });

  it("rejects /imlang alone as invalid input", async () => {
    const result = await actions.adminSendMessageAction({
      userId,
      body: "/imlang",
      clientId: uuid(1),
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.INVALID_INPUT,
    });
    expect(await rows()).toHaveLength(0);
  });

  it("is idempotent per clientId", async () => {
    const input = { userId, body: "ok", clientId: uuid(1) };
    const first = await actions.adminSendMessageAction(input);
    const second = await actions.adminSendMessageAction(input);

    expect(await rows()).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("schedules one push to the trainee, none for a retried clientId", async () => {
    state.role = "admin";
    const input = { userId, body: "ok", clientId: uuid(1) };

    await actions.adminSendMessageAction(input);
    await actions.adminSendMessageAction(input);

    expect(chatPush.schedulePush).toHaveBeenCalledTimes(1);
    expect(chatPush.schedulePush).toHaveBeenCalledWith({
      senderRole: "admin",
      senderAdminId: 7,
      traineeUserId: userId,
      conversationId: expect.any(Number),
      body: "ok",
    });
  });

  it("rejects a locked trainee (D6) and writes nothing", async () => {
    const lockedId = await addUser("Binh", false);
    const never = await addUser("Cuong", null);

    for (const id of [lockedId, never]) {
      const result = await actions.adminSendMessageAction({
        userId: id,
        body: "hi",
        clientId: uuid(1),
      });

      expect(result).toEqual({
        status: "error",
        message: "PT đã tạm khoá nhắn tin",
      });
    }
    expect(await rows()).toHaveLength(0);
  });

  it("rejects an unknown trainee", async () => {
    const result = await actions.adminSendMessageAction({
      userId: 9999,
      body: "hi",
      clientId: uuid(1),
    });

    expect(result).toEqual({
      status: "error",
      message: "Không tìm thấy user này",
    });
  });

  it("redirects a trainee session", async () => {
    state.role = "user";
    await expect(
      actions.adminSendMessageAction({ userId, body: "hi", clientId: uuid(1) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(await rows()).toHaveLength(0);
  });
});

describe("mark read", () => {
  const cursorOf = async (readerKey: string) => {
    const [row] = await db
      .select()
      .from(chatReads)
      .where(eq(chatReads.readerKey, readerKey));

    return row?.lastReadMessageId;
  };

  const seed = async (count: number) => {
    state.role = "admin";
    const ids: number[] = [];

    for (let i = 1; i <= count; i++) {
      const result = await actions.adminSendMessageAction({
        userId,
        body: `tin ${i}`,
        clientId: uuid(i),
      });

      if (result.status === "success") {
        ids.push(result.message.id);
      }
    }
    state.role = "user";
    return ids;
  };

  it("never moves backwards", async () => {
    const ids = await seed(5);

    await actions.markReadAction({ lastReadMessageId: ids[3] });
    await actions.markReadAction({ lastReadMessageId: ids[1] });

    expect(await cursorOf("user")).toBe(ids[3]);
  });

  it("is clamped to the last message id", async () => {
    const ids = await seed(3);

    await actions.markReadAction({ lastReadMessageId: 99999 });

    expect(await cursorOf("user")).toBe(ids[2]);
  });

  it("rejects bad input and stores nothing", async () => {
    await seed(2);
    const result = await actions.markReadAction({ lastReadMessageId: -1 });

    expect(result.status).toBe("error");
    expect(await cursorOf("user")).toBeUndefined();
  });

  it("works while chat is locked (D5)", async () => {
    const ids = await seed(2);

    await db.update(users).set({ chatEnabled: false });
    const result = await actions.markReadAction({ lastReadMessageId: ids[1] });

    expect(result).toEqual({ status: "success" });
    expect(await cursorOf("user")).toBe(ids[1]);
  });

  it("is a no-op success without a conversation", async () => {
    const result = await actions.markReadAction({ lastReadMessageId: 5 });

    expect(result).toEqual({ status: "success" });
    expect(await db.select().from(chatReads)).toHaveLength(0);
  });

  it("admin read is stored per admin and 404s a missing conversation", async () => {
    const ids = await seed(2);
    const conversation = await queries.findConversationByUserId(userId);

    state.role = "admin";
    state.adminId = 7;
    await actions.adminMarkReadAction({
      conversationId: conversation!.id,
      lastReadMessageId: ids[1],
    });
    const missing = await actions.adminMarkReadAction({
      conversationId: 9999,
      lastReadMessageId: 1,
    });

    expect(await cursorOf("admin:7")).toBe(ids[1]);
    expect(missing).toEqual({
      status: "error",
      message: "Không tìm thấy cuộc trò chuyện",
    });
  });
});
