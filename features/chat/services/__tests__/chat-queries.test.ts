import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, chatNicknames, users } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const q = await import("@/features/chat/services/chat-queries");

let db: TestDb;
let seq = 0;

const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const addUser = async (name: string, chatEnabled: boolean | null = true) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name.toLowerCase(), chatEnabled })
    .returning({ id: users.id });

  return row.id;
};

const send = async (
  conversationId: number,
  from: "user" | "admin",
  body: string,
  adminId: number | null = from === "admin" ? 1 : null,
) =>
  (
    await q.insertMessage({
      conversationId,
      senderRole: from,
      senderAdminId: adminId,
      body,
      clientId: uuid(),
    })
  ).id;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  seq = 0;
  await db.insert(admins).values([
    { username: "pt-one", usernameKey: "pt-one", passwordHash: "x" },
    { username: "pt-two", usernameKey: "pt-two", passwordHash: "x" },
  ]);
});

describe("getOrCreateConversation", () => {
  it("creates once and returns the same row", async () => {
    const userId = await addUser("An");
    const [a, b] = await Promise.all([
      q.getOrCreateConversation(userId),
      q.getOrCreateConversation(userId),
    ]);

    expect(a.id).toBe(b.id);
    expect(a.userId).toBe(userId);
  });
});

describe("listMessages", () => {
  it("pages 35 messages: latest 30, before the first, after a cursor", async () => {
    const userId = await addUser("An");
    const { id } = await q.getOrCreateConversation(userId);
    const ids: number[] = [];

    for (let i = 1; i <= 35; i++) {
      ids.push(await send(id, "user", `tin ${i}`));
    }
    const latest = await q.listMessages(id);

    expect(latest.messages.map((m) => m.body)).toEqual(
      Array.from({ length: 30 }, (_, i) => `tin ${i + 6}`),
    );
    expect(latest.hasMore).toBe(true);

    const older = await q.listMessages(id, { before: latest.messages[0].id });

    expect(older.messages.map((m) => m.body)).toEqual([
      "tin 1",
      "tin 2",
      "tin 3",
      "tin 4",
      "tin 5",
    ]);
    expect(older.hasMore).toBe(false);

    const newer = await q.listMessages(id, { after: ids[31] });

    expect(newer.messages.map((m) => m.body)).toEqual([
      "tin 33",
      "tin 34",
      "tin 35",
    ]);
    expect(newer.hasMore).toBe(false);
    expect((await q.listMessages(id, { after: ids[34] })).messages).toEqual([]);
  });

  it("exposes only the public columns and the admin name", async () => {
    const userId = await addUser("An");
    const { id } = await q.getOrCreateConversation(userId);

    await send(id, "admin", "chào", 1);
    await send(id, "admin", "từ admin đã xoá", 99);
    const { messages } = await q.listMessages(id);

    expect(Object.keys(messages[0]).sort()).toEqual([
      "body",
      "clientId",
      "createdAt",
      "deleted",
      "editedAt",
      "id",
      "reactions",
      "replyTo",
      "senderAdminId",
      "senderAdminName",
      "senderRole",
      "sticker",
      "updatedAt",
    ]);
    expect(messages.map((m) => m.senderAdminName)).toEqual(["pt-one", null]);
  });

  it("keeps conversations apart", async () => {
    const a = await q.getOrCreateConversation(await addUser("An"));
    const b = await q.getOrCreateConversation(await addUser("Binh"));

    await send(a.id, "user", "của An");
    await send(b.id, "user", "của Binh");

    expect((await q.listMessages(a.id)).messages.map((m) => m.body)).toEqual([
      "của An",
    ]);
  });
});

describe("unread counts and read cursors", () => {
  it("trainee counts only admin messages after its cursor", async () => {
    const userId = await addUser("An");
    const { id } = await q.getOrCreateConversation(userId);

    await send(id, "user", "của tôi");
    const first = await send(id, "admin", "PT 1");
    await send(id, "admin", "PT 2");
    await send(id, "user", "của tôi nữa");

    expect(await q.countUnreadForUser(userId)).toBe(2);

    await q.saveReadCursor(id, "user", first, 100);

    expect(await q.countUnreadForUser(userId)).toBe(1);
    expect(await q.countUnreadForUser(12345)).toBe(0);
  });

  it("admin A reading does not clear admin B", async () => {
    const userId = await addUser("An");
    const { id } = await q.getOrCreateConversation(userId);

    await send(id, "admin", "PT trả lời");
    const last = await send(id, "user", "tin 1");
    await send(id, "user", "tin 2");

    expect(await q.countUnreadForAdmin(1)).toBe(2);
    expect(await q.countUnreadForAdmin(2)).toBe(2);

    await q.saveReadCursor(id, "admin:1", last, last + 1);

    expect(await q.countUnreadForAdmin(1)).toBe(1);
    expect(await q.countUnreadForAdmin(2)).toBe(2);
  });

  it("peer read cursor: trainee sees the furthest admin, admin sees trainee", async () => {
    const { id } = await q.getOrCreateConversation(await addUser("An"));

    expect(await q.getPeerReadCursor(id, "user")).toBe(0);
    await q.saveReadCursor(id, "admin:1", 4, 10);
    await q.saveReadCursor(id, "admin:2", 9, 10);
    await q.saveReadCursor(id, "user", 3, 10);

    expect(await q.getPeerReadCursor(id, "user")).toBe(9);
    expect(await q.getPeerReadCursor(id, "admin")).toBe(3);
  });

  it("saveReadCursor never moves back and clamps to the last id", async () => {
    const { id } = await q.getOrCreateConversation(await addUser("An"));

    expect(await q.saveReadCursor(id, "user", 8, 10)).toBe(8);
    expect(await q.saveReadCursor(id, "user", 2, 10)).toBe(8);
    expect(await q.saveReadCursor(id, "user", 50, 10)).toBe(10);
    expect(await q.getPeerReadCursor(id, "admin")).toBe(10);
  });
});

describe("listAdminInbox", () => {
  it("sorts by last message, counts unread per admin, lists fresh trainees", async () => {
    const anId = await addUser("An");
    const binhId = await addUser("Binh", false);
    const cuongId = await addUser("Cuong");
    const lanId = await addUser("Lan");

    await addUser("Mai", null);
    const an = await q.getOrCreateConversation(anId);
    const binh = await q.getOrCreateConversation(binhId);

    await send(an.id, "user", "An cũ");
    const binhLast = await send(binh.id, "user", "x".repeat(120));
    const anLast = await send(an.id, "admin", "PT trả lời An");
    await send(an.id, "user", "An mới nhất");
    await send(an.id, "user", "An nữa");

    // Same timestamps are possible; force a deterministic order.
    await q.saveReadCursor(binh.id, "admin:1", binhLast, binhLast);

    const inbox1 = await q.listAdminInbox(1);
    const inbox2 = await q.listAdminInbox(2);

    expect(inbox1.conversations.map((c) => c.userName)).toEqual(["An", "Binh"]);
    expect(inbox1.conversations.map((c) => [c.unread, c.chatEnabled])).toEqual([
      [3, true],
      [0, false],
    ]);
    expect(inbox2.conversations.map((c) => c.unread)).toEqual([3, 1]);
    expect(inbox1.conversations[0]).toMatchObject({
      conversationId: an.id,
      userId: anId,
      preview: "An nữa",
      lastFromAdmin: false,
    });
    expect(inbox1.conversations[1].preview).toBe("x".repeat(80));
    expect(anLast).toBeGreaterThan(binhLast);
    expect(inbox1.withoutConversation).toEqual([
      { userId: cuongId, userName: "Cuong", lastSeenAt: null },
      { userId: lanId, userName: "Lan", lastSeenAt: null },
    ]);
    expect(inbox1.conversations.map((c) => c.lastSeenAt)).toEqual([null, null]);
  });

  it("includes each trainee's lastSeenAt", async () => {
    const seen = new Date("2026-11-05T02:00:00Z");
    const anId = await addUser("An");
    const lanId = await addUser("Lan");

    await q.getOrCreateConversation(anId);
    await db.update(users).set({ lastSeenAt: seen }).where(eq(users.id, anId));
    await db.update(users).set({ lastSeenAt: seen }).where(eq(users.id, lanId));
    const inbox = await q.listAdminInbox(1);

    expect(inbox.conversations[0].lastSeenAt).toEqual(seen);
    expect(inbox.withoutConversation[0].lastSeenAt).toEqual(seen);
  });

  it("shows the trainee nickname as displayName, real name as fallback", async () => {
    const an = await q.getOrCreateConversation(await addUser("An"));
    const binh = await q.getOrCreateConversation(await addUser("Binh"));
    const updatedAt = new Date();

    await send(an.id, "user", "hi");
    await send(binh.id, "user", "hi");
    await db.insert(chatNicknames).values([
      {
        conversationId: an.id,
        targetKey: "user",
        nickname: "Bé Na",
        setByKey: "admin:1",
        updatedAt,
      },
      // Other targets and blank nicknames never become the trainee's name.
      {
        conversationId: an.id,
        targetKey: "pt",
        nickname: "Thầy",
        setByKey: "user",
        updatedAt,
      },
      {
        conversationId: binh.id,
        targetKey: "user",
        nickname: "   ",
        setByKey: "user",
        updatedAt,
      },
    ]);
    const { conversations } = await q.listAdminInbox(1);
    const byId = new Map(conversations.map((c) => [c.conversationId, c]));

    expect(byId.get(an.id)).toMatchObject({
      displayName: "Bé Na",
      userName: "An",
    });
    expect(byId.get(binh.id)).toMatchObject({
      displayName: "Binh",
      userName: "Binh",
    });
  });

  it("flags a last message sent by an admin", async () => {
    const { id } = await q.getOrCreateConversation(await addUser("An"));

    await send(id, "admin", "PT nói trước");
    const inbox = await q.listAdminInbox(1);

    expect(inbox.conversations[0]).toMatchObject({
      lastFromAdmin: true,
      unread: 0,
      preview: "PT nói trước",
    });
  });
});
