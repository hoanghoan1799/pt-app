import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatConversations,
  chatMessages,
  users,
} from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number },
  admin: null as null | { id: number },
  revealed: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => state.revealed),
}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const traineeRoute = await import("@/app/api/chat/search/route");
const adminRoute =
  await import("@/app/api/admin/chat/[conversationId]/search/route");
const search = await import("@/features/chat/services/chat-search");

let db: TestDb;
let seq = 0;
let alice: number;
let bob: number;
let aliceConversation: number;
let bobConversation: number;

const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const addMessage = async (
  conversationId: number,
  from: "user" | "admin",
  body: string,
  options: { sticker?: boolean; deleted?: boolean } = {},
) => {
  const [row] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      senderRole: from,
      senderAdminId: from === "admin" ? 1 : null,
      body,
      clientId: uuid(),
      stickerRef: options.sticker ? "pack:wave" : null,
      stickerUrl: options.sticker ? "/stickers/wave.webp" : null,
      deletedAt: options.deleted ? new Date() : null,
      createdAt: new Date(),
    })
    .returning({ id: chatMessages.id });

  return row.id;
};

const asUser = (id: number) => {
  state.user = { id };
  state.admin = null;
};

const asAdmin = (id: number) => {
  state.user = null;
  state.admin = { id };
};

const getTrainee = (query: string) =>
  traineeRoute.GET(new NextRequest(`http://localhost/api/chat/search${query}`));

const getAdmin = (conversationId: number | string, query: string) =>
  adminRoute.GET(
    new NextRequest(
      `http://localhost/api/admin/chat/${conversationId}/search${query}`,
    ),
    { params: Promise.resolve({ conversationId: String(conversationId) }) },
  );

const ids = (page: { results: { messageId: number }[] }) =>
  page.results.map((result) => result.messageId);

beforeEach(async () => {
  state.revealed = false;
  db = await createTestDb();
  state.db = db;
  await db.insert(admins).values([
    { username: "pt1", usernameKey: "pt1", passwordHash: "x" },
    { username: "pt2", usernameKey: "pt2", passwordHash: "x" },
  ]);
  const rows = await db
    .insert(users)
    .values([
      { name: "An", nameKey: "an", chatEnabled: true },
      { name: "Bình", nameKey: "binh", chatEnabled: true },
    ])
    .returning({ id: users.id });

  [alice, bob] = rows.map((row) => row.id);
  const conversations = await db
    .insert(chatConversations)
    .values([{ userId: alice }, { userId: bob }])
    .returning({ id: chatConversations.id });

  [aliceConversation, bobConversation] = conversations.map((row) => row.id);
  asUser(alice);
});

describe("searchConversation", () => {
  it("finds 'ăn' with 'an' and 'đồ' with 'do', newest first", async () => {
    const first = await addMessage(aliceConversation, "user", "Em ăn cơm gà");

    await addMessage(aliceConversation, "admin", "Tập tạ nhé");
    const second = await addMessage(aliceConversation, "admin", "Đồ ăn vặt?");
    const third = await addMessage(aliceConversation, "user", "Mua đồ rồi");

    expect(
      ids(await search.searchConversation(aliceConversation, "an")),
    ).toEqual([second, first]);
    expect(
      ids(await search.searchConversation(aliceConversation, "do")),
    ).toEqual([third, second]);
    expect(
      ids(await search.searchConversation(aliceConversation, "ĐỒ")),
    ).toEqual([third, second]);
  });

  it("returns the sender, a snippet with the match as written and the time", async () => {
    const id = await addMessage(aliceConversation, "admin", "Hôm nay ăn nhẹ");
    const { results } = await search.searchConversation(
      aliceConversation,
      "an",
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      messageId: id,
      senderRole: "admin",
      senderAdminId: 1,
      senderName: "pt1",
      snippet: { before: "Hôm nay ", match: "ăn", after: " nhẹ" },
    });
    expect(Date.parse(results[0].createdAt)).not.toBeNaN();
  });

  it("leaves out unsent messages, stickers and other conversations", async () => {
    const kept = await addMessage(aliceConversation, "user", "bữa ăn sáng");

    await addMessage(aliceConversation, "user", "bữa ăn tối", {
      deleted: true,
    });
    await addMessage(aliceConversation, "user", "ăn", { sticker: true });
    await addMessage(bobConversation, "user", "bữa ăn trưa");

    expect(
      ids(await search.searchConversation(aliceConversation, "an")),
    ).toEqual([kept]);
  });

  it("pages with a cursor, with no gaps or repeats", async () => {
    const all: number[] = [];

    for (let index = 0; index < 5; index += 1) {
      all.push(await addMessage(aliceConversation, "user", `ăn lần ${index}`));
      await addMessage(aliceConversation, "admin", "ok nhé");
    }
    const newestFirst = [...all].reverse();
    const one = await search.searchConversation(aliceConversation, "an", {
      limit: 2,
    });

    expect(ids(one)).toEqual(newestFirst.slice(0, 2));
    expect(one.nextCursor).toBe(newestFirst[1]);
    const two = await search.searchConversation(aliceConversation, "an", {
      limit: 2,
      before: one.nextCursor ?? undefined,
    });

    expect(ids(two)).toEqual(newestFirst.slice(2, 4));
    const three = await search.searchConversation(aliceConversation, "an", {
      limit: 2,
      before: two.nextCursor ?? undefined,
    });

    expect(ids(three)).toEqual([newestFirst[4]]);
    expect(three.nextCursor).toBeNull();
  });

  it("has no next page when the matches fill exactly one page", async () => {
    await addMessage(aliceConversation, "user", "ăn một");
    await addMessage(aliceConversation, "user", "ăn hai");

    const page = await search.searchConversation(aliceConversation, "an", {
      limit: 2,
    });

    expect(page.results).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("scans past more than one batch of non-matching messages", async () => {
    const old = await addMessage(aliceConversation, "user", "ăn sáng cũ");

    for (let index = 0; index < 650; index += 1) {
      await addMessage(aliceConversation, "admin", `tin số ${index}`);
    }
    expect(
      ids(await search.searchConversation(aliceConversation, "an sang")),
    ).toEqual([old]);
  });
});

describe("GET /api/chat/search (trainee)", () => {
  it("searches only the trainee's own conversation", async () => {
    const mine = await addMessage(aliceConversation, "user", "ăn sáng");

    await addMessage(bobConversation, "user", "ăn tối");

    const response = await getTrainee("?q=an");

    expect(response.status).toBe(200);
    expect(ids(await response.json())).toEqual([mine]);
  });

  it("is empty for a trainee without a conversation", async () => {
    const [carol] = await db
      .insert(users)
      .values({ name: "Chi", nameKey: "chi", chatEnabled: true })
      .returning({ id: users.id });

    asUser(carol.id);
    const response = await getTrainee("?q=an");

    expect(await response.json()).toEqual({ results: [], nextCursor: null });
  });

  it("is 401 signed out, 400 for a short query or a bad cursor", async () => {
    state.user = null;
    expect((await getTrainee("?q=an")).status).toBe(401);
    asUser(alice);
    expect((await getTrainee("")).status).toBe(400);
    expect((await getTrainee("?q=a")).status).toBe(400);
    expect((await getTrainee("?q=an&before=abc")).status).toBe(400);
  });
});

describe("GET /api/admin/chat/[conversationId]/search", () => {
  it("serves any admin the matches of an accessible trainee", async () => {
    const id = await addMessage(aliceConversation, "user", "ăn sáng");

    asAdmin(2);
    const response = await getAdmin(aliceConversation, "?q=an");

    expect(response.status).toBe(200);
    expect(ids(await response.json())).toEqual([id]);
  });

  it("is 404 for the admin who hid the trainee until they reveal, but not for others", async () => {
    await addMessage(aliceConversation, "user", "ăn sáng");
    await db.insert(adminHiddenUsers).values({ adminId: 1, userId: alice });

    asAdmin(1);
    expect((await getAdmin(aliceConversation, "?q=an")).status).toBe(404);
    asAdmin(2);
    expect((await getAdmin(aliceConversation, "?q=an")).status).toBe(200);
    asAdmin(1);
    state.revealed = true;
    expect((await getAdmin(aliceConversation, "?q=an")).status).toBe(200);
  });

  it("is 404 for a missing conversation, 400 for bad input, 401 for a trainee", async () => {
    asAdmin(1);
    expect((await getAdmin(9999, "?q=an")).status).toBe(404);
    expect((await getAdmin("abc", "?q=an")).status).toBe(400);
    expect((await getAdmin(aliceConversation, "?q=a")).status).toBe(400);
    asUser(alice);
    expect((await getAdmin(aliceConversation, "?q=an")).status).toBe(401);
  });
});
