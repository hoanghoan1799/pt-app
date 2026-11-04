import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { chatMessages, chatReads, rateLimits, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "user" as "user" | "admin",
  userId: 1,
  adminId: 7,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/session", () => ({
  readSession: vi.fn(async () =>
    state.role === "admin"
      ? { role: "admin", adminId: state.adminId }
      : { role: "user", userId: state.userId },
  ),
}));
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

const actions = await import("@/features/chat/services/chat-actions");
const queries = await import("@/features/chat/services/chat-queries");

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

const rows = () => db.select().from(chatMessages);

beforeEach(async () => {
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

  it("does not count a retried clientId against the rate limit", async () => {
    await actions.sendMessageAction({ body: "một", clientId: uuid(1) });
    await actions.sendMessageAction({ body: "một", clientId: uuid(1) });

    const [minute] = await db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, `chat:user:${userId}:min`));

    expect(minute.count).toBe(1);
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

  it("allows 20 sends a minute and rejects the 21st", async () => {
    for (let i = 1; i <= 20; i++) {
      const ok = await actions.sendMessageAction({
        body: `tin ${i}`,
        clientId: uuid(i),
      });

      expect(ok.status).toBe("success");
    }
    const blocked = await actions.sendMessageAction({
      body: "tin 21",
      clientId: uuid(21),
    });

    expect(blocked).toEqual({
      status: "error",
      message: "Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau",
    });
    expect(await rows()).toHaveLength(20);
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

  it("is idempotent per clientId", async () => {
    const input = { userId, body: "ok", clientId: uuid(1) };
    const first = await actions.adminSendMessageAction(input);
    const second = await actions.adminSendMessageAction(input);

    expect(await rows()).toHaveLength(1);
    expect(second).toEqual(first);
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

  it("limits an admin to 60 messages a minute", async () => {
    for (let i = 1; i <= 60; i++) {
      await actions.adminSendMessageAction({
        userId,
        body: `tin ${i}`,
        clientId: uuid(i),
      });
    }
    const blocked = await actions.adminSendMessageAction({
      userId,
      body: "tin 61",
      clientId: uuid(61),
    });

    expect(blocked).toEqual({
      status: "error",
      message: "Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau",
    });
    expect(await rows()).toHaveLength(60);
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
