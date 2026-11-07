import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatConversations,
  chatMessages,
  chatPhotos,
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

const traineeRoute = await import("@/app/api/chat/gallery/route");
const adminRoute =
  await import("@/app/api/admin/chat/[conversationId]/gallery/route");
const gallery = await import("@/features/chat/services/chat-gallery");
const queries = await import("@/features/chat/services/chat-queries");

let db: TestDb;
let seq = 0;
let alice: number;
let bob: number;
let aliceConversation: number;
let bobConversation: number;

const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

// A message; with `photo` it carries a stored photo, as the send action leaves
// it (photo row attached to the message, message points at the photo).
const addMessage = async (
  conversationId: number,
  from: "user" | "admin",
  options: { photo?: boolean; sticker?: boolean; deleted?: boolean } = {},
) => {
  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      senderRole: from,
      senderAdminId: from === "admin" ? 1 : null,
      body: "",
      clientId: uuid(),
      stickerRef: options.sticker ? "pack:trophy" : null,
      stickerUrl: options.sticker ? "/stickers/fluent/trophy.svg" : null,
      deletedAt: options.deleted ? new Date() : null,
      createdAt: new Date(),
    })
    .returning({ id: chatMessages.id });

  if (!options.photo) {
    return { messageId: message.id, photoId: null };
  }
  const [photo] = await db
    .insert(chatPhotos)
    .values({
      conversationId,
      messageId: message.id,
      uploaderKey: from === "user" ? "user" : "admin:1",
      mime: "image/webp",
      width: 800,
      height: 600,
      data: Buffer.from([1, 2, 3]),
      size: 3,
      createdAt: new Date(),
    })
    .returning({ id: chatPhotos.id });

  await db
    .update(chatMessages)
    .set({ photoId: photo.id })
    .where(eq(chatMessages.id, message.id));
  return { messageId: message.id, photoId: photo.id };
};

const asUser = (id: number) => {
  state.user = { id };
  state.admin = null;
};

const asAdmin = (id: number) => {
  state.user = null;
  state.admin = { id };
};

const getTrainee = (query = "") =>
  traineeRoute.GET(
    new NextRequest(`http://localhost/api/chat/gallery${query}`),
  );

const getAdmin = (conversationId: number | string, query = "") =>
  adminRoute.GET(
    new NextRequest(
      `http://localhost/api/admin/chat/${conversationId}/gallery${query}`,
    ),
    { params: Promise.resolve({ conversationId: String(conversationId) }) },
  );

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

describe("listGalleryPhotos", () => {
  it("returns photo messages newest first, with the sender", async () => {
    const first = await addMessage(aliceConversation, "user", { photo: true });

    await addMessage(aliceConversation, "user"); // text only
    const second = await addMessage(aliceConversation, "admin", {
      photo: true,
    });

    const page = await gallery.listGalleryPhotos(aliceConversation);

    expect(page.items.map((item) => item.photoId)).toEqual([
      second.photoId,
      first.photoId,
    ]);
    expect(page.items[0]).toMatchObject({
      messageId: second.messageId,
      senderKey: "admin:1",
      senderName: "pt1",
      url: `/api/chat/photos/${second.photoId}`,
      width: 800,
      height: 600,
    });
    expect(page.items[1]).toMatchObject({
      senderKey: "user",
      senderName: "An",
    });
    expect(page.nextCursor).toBeNull();
  });

  it("leaves out stickers, unsent photos and other conversations", async () => {
    const kept = await addMessage(aliceConversation, "user", { photo: true });

    await addMessage(aliceConversation, "user", { sticker: true });
    await addMessage(aliceConversation, "user", {
      photo: true,
      deleted: true,
    });
    await addMessage(bobConversation, "user", { photo: true });

    const page = await gallery.listGalleryPhotos(aliceConversation);

    expect(page.items.map((item) => item.photoId)).toEqual([kept.photoId]);
  });

  it("pages with a cursor: no gaps, no repeats, nextCursor null at the end", async () => {
    const ids: number[] = [];

    for (let index = 0; index < 5; index += 1) {
      ids.push(
        (await addMessage(aliceConversation, "user", { photo: true }))
          .messageId,
      );
    }
    const newestFirst = [...ids].reverse();
    const one = await gallery.listGalleryPhotos(aliceConversation, {
      limit: 2,
    });

    expect(one.items.map((item) => item.messageId)).toEqual(
      newestFirst.slice(0, 2),
    );
    expect(one.nextCursor).toBe(newestFirst[1]);
    const two = await gallery.listGalleryPhotos(aliceConversation, {
      limit: 2,
      before: one.nextCursor ?? undefined,
    });

    expect(two.items.map((item) => item.messageId)).toEqual(
      newestFirst.slice(2, 4),
    );
    const three = await gallery.listGalleryPhotos(aliceConversation, {
      limit: 2,
      before: two.nextCursor ?? undefined,
    });

    expect(three.items.map((item) => item.messageId)).toEqual([newestFirst[4]]);
    expect(three.nextCursor).toBeNull();
  });

  it("has no next page when the photos fill exactly one page", async () => {
    await addMessage(aliceConversation, "user", { photo: true });
    await addMessage(aliceConversation, "user", { photo: true });

    const page = await gallery.listGalleryPhotos(aliceConversation, {
      limit: 2,
    });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });
});

describe("GET /api/chat/gallery (trainee)", () => {
  it("serves only the trainee's own conversation", async () => {
    const mine = await addMessage(aliceConversation, "user", { photo: true });

    await addMessage(bobConversation, "user", { photo: true });

    const response = await getTrainee();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items.map((item: { photoId: number }) => item.photoId)).toEqual(
      [mine.photoId],
    );
  });

  it("is empty for a trainee without a conversation", async () => {
    const [carol] = await db
      .insert(users)
      .values({ name: "Chi", nameKey: "chi", chatEnabled: true })
      .returning({ id: users.id });

    asUser(carol.id);
    const response = await getTrainee();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });

  it("is 401 signed out and 400 for a bad cursor", async () => {
    state.user = null;
    expect((await getTrainee()).status).toBe(401);
    asUser(alice);
    expect((await getTrainee("?before=abc")).status).toBe(400);
    expect((await getTrainee("?before=0")).status).toBe(400);
  });

  it("pages by the before cursor", async () => {
    const older = await addMessage(aliceConversation, "user", { photo: true });
    const newer = await addMessage(aliceConversation, "user", { photo: true });
    const response = await getTrainee(`?before=${newer.messageId}`);
    const body = await response.json();

    expect(body.items.map((item: { photoId: number }) => item.photoId)).toEqual(
      [older.photoId],
    );
  });
});

describe("GET /api/admin/chat/[conversationId]/gallery", () => {
  it("serves any admin the photos of an accessible trainee", async () => {
    const photo = await addMessage(aliceConversation, "user", { photo: true });

    asAdmin(2);
    const response = await getAdmin(aliceConversation);

    expect(response.status).toBe(200);
    expect(
      (await response.json()).items.map(
        (item: { photoId: number }) => item.photoId,
      ),
    ).toEqual([photo.photoId]);
  });

  it("is 404 for the admin who hid the trainee until they reveal, but not for others", async () => {
    await addMessage(aliceConversation, "user", { photo: true });
    await db.insert(adminHiddenUsers).values({ adminId: 1, userId: alice });

    asAdmin(1);
    expect((await getAdmin(aliceConversation)).status).toBe(404);
    asAdmin(2);
    expect((await getAdmin(aliceConversation)).status).toBe(200);
    asAdmin(1);
    state.revealed = true;
    expect((await getAdmin(aliceConversation)).status).toBe(200);
  });

  it("is 404 for a missing conversation, 400 for a bad id, 401 for a trainee", async () => {
    asAdmin(1);
    expect((await getAdmin(9999)).status).toBe(404);
    expect((await getAdmin("abc")).status).toBe(400);
    asUser(alice);
    expect((await getAdmin(aliceConversation)).status).toBe(401);
  });
});

describe("loadGalleryForAdmin", () => {
  it("answers not_found for a hidden trainee and ok otherwise", async () => {
    await db.insert(adminHiddenUsers).values({ adminId: 1, userId: bob });

    expect(await gallery.loadGalleryForAdmin(1, bobConversation)).toEqual({
      status: "not_found",
    });
    expect(
      (await gallery.loadGalleryForAdmin(1, aliceConversation)).status,
    ).toBe("ok");
  });
});

describe("listMessagesAround", () => {
  it("returns the page ending at the target and every newer message", async () => {
    const ids: number[] = [];

    for (let index = 0; index < 45; index += 1) {
      ids.push((await addMessage(aliceConversation, "user")).messageId);
    }
    const target = ids[5];
    const around = await queries.listMessagesAround(aliceConversation, target);

    expect(around).not.toBeNull();
    // Oldest first, ends at the newest message, contains the target.
    expect(around?.messages.map((message) => message.id)).toEqual(
      ids.slice(0, ids.length),
    );
    expect(around?.hasMore).toBe(false);

    const far = await queries.listMessagesAround(aliceConversation, ids[40]);

    expect(far?.messages.at(0)?.id).toBe(ids[40 - 29]);
    expect(far?.messages.at(-1)?.id).toBe(ids[44]);
    expect(far?.hasMore).toBe(true);
  });

  it("is null for a message of another conversation or one that does not exist", async () => {
    const other = await addMessage(bobConversation, "user");

    expect(
      await queries.listMessagesAround(aliceConversation, other.messageId),
    ).toBeNull();
    expect(
      await queries.listMessagesAround(aliceConversation, 99999),
    ).toBeNull();
  });
});

// Plain rows for the sticker and link tabs.
const addText = async (
  conversationId: number,
  from: "user" | "admin",
  fields: {
    body?: string;
    stickerRef?: string;
    stickerUrl?: string;
    deleted?: boolean;
  },
) => {
  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      senderRole: from,
      senderAdminId: from === "admin" ? 1 : null,
      body: fields.body ?? "",
      clientId: uuid(),
      stickerRef: fields.stickerRef ?? null,
      stickerUrl: fields.stickerUrl ?? null,
      deletedAt: fields.deleted ? new Date() : null,
      createdAt: new Date(),
    })
    .returning({ id: chatMessages.id });

  return message.id;
};

const GIPHY_URL = "https://media.giphy.com/media/abc123/giphy.gif";

describe("listGalleryStickers", () => {
  it("lists custom, pack and GIPHY stickers newest first, not photos or unsent", async () => {
    const pack = await addText(aliceConversation, "user", {
      stickerRef: "pack:trophy",
      stickerUrl: "/stickers/fluent/trophy.svg",
    });

    await addMessage(aliceConversation, "user", { photo: true });
    const custom = await addText(aliceConversation, "admin", {
      stickerRef: "custom:7",
      stickerUrl: "/api/chat/stickers/custom/7",
    });
    const giphy = await addText(aliceConversation, "user", {
      stickerRef: "giphy:abc123",
      stickerUrl: GIPHY_URL,
    });

    await addText(aliceConversation, "user", {
      stickerRef: "custom:8",
      stickerUrl: "/api/chat/stickers/custom/8",
      deleted: true,
    });
    await addText(bobConversation, "user", {
      stickerRef: "pack:trophy",
      stickerUrl: "/stickers/fluent/trophy.svg",
    });
    await addText(aliceConversation, "user", { body: "just text" });

    const page = await gallery.listGalleryStickers(aliceConversation);

    expect(page.items.map((item) => [item.messageId, item.kind])).toEqual([
      [giphy, "giphy"],
      [custom, "custom"],
      [pack, "pack"],
    ]);
    expect(page.items[1]).toMatchObject({
      senderKey: "admin:1",
      senderName: "pt1",
      url: "/api/chat/stickers/custom/7",
    });
    expect(page.nextCursor).toBeNull();
  });

  it("skips a row whose ref and URL disagree and pages by cursor", async () => {
    const first = await addText(aliceConversation, "user", {
      stickerRef: "pack:trophy",
      stickerUrl: "/stickers/fluent/trophy.svg",
    });

    await addText(aliceConversation, "user", {
      stickerRef: "custom:3",
      stickerUrl: "https://evil.example/x.png",
    });
    const third = await addText(aliceConversation, "user", {
      stickerRef: "pack:trophy",
      stickerUrl: "/stickers/fluent/trophy.svg",
    });
    const one = await gallery.listGalleryStickers(aliceConversation, {
      limit: 1,
    });

    expect(one.items.map((item) => item.messageId)).toEqual([third]);
    expect(one.nextCursor).toBe(third);
    const two = await gallery.listGalleryStickers(aliceConversation, {
      limit: 2,
      before: one.nextCursor ?? undefined,
    });

    expect(two.items.map((item) => item.messageId)).toEqual([first]);
    expect(two.nextCursor).toBeNull();
  });
});

describe("listGalleryLinks", () => {
  it("gives one row per URL of live text messages, newest first", async () => {
    const older = await addText(aliceConversation, "user", {
      body: "xem www.example.com/a, rồi https://b.org/x.",
    });

    await addText(aliceConversation, "user", { body: "không có link" });
    await addText(aliceConversation, "user", {
      body: "https://unsent.example/z",
      deleted: true,
    });
    await addText(bobConversation, "user", { body: "https://bob.example/" });
    const newer = await addText(aliceConversation, "admin", {
      body: "javascript:alert(1) và https://c.vn/y",
    });

    const page = await gallery.listGalleryLinks(aliceConversation);

    expect(page.items.map((item) => [item.messageId, item.href])).toEqual([
      [newer, "https://c.vn/y"],
      [older, "https://www.example.com/a"],
      [older, "https://b.org/x"],
    ]);
    expect(page.items[0]).toMatchObject({
      domain: "c.vn",
      senderKey: "admin:1",
      senderName: "pt1",
    });
    expect(page.items[1]).toMatchObject({
      text: "www.example.com/a",
      senderKey: "user",
      senderName: "An",
    });
    expect(page.nextCursor).toBeNull();
  });

  it("pages by message, skipping messages that only look like links", async () => {
    const ids: number[] = [];

    for (let index = 0; index < 3; index += 1) {
      ids.push(
        await addText(aliceConversation, "user", {
          body: `link https://site${index}.com/`,
        }),
      );
      await addText(aliceConversation, "user", { body: "http:// nothing" });
    }
    const one = await gallery.listGalleryLinks(aliceConversation, {
      limit: 2,
    });

    expect(one.items.map((item) => item.messageId)).toEqual([ids[2], ids[1]]);
    expect(one.nextCursor).toBe(ids[1]);
    const two = await gallery.listGalleryLinks(aliceConversation, {
      limit: 2,
      before: one.nextCursor ?? undefined,
    });

    expect(two.items.map((item) => item.messageId)).toEqual([ids[0]]);
    expect(two.nextCursor).toBeNull();
  });
});

describe("gallery routes by tab", () => {
  it("serves the stickers and links tabs to the trainee, photos by default", async () => {
    const photo = await addMessage(aliceConversation, "user", { photo: true });
    const sticker = await addText(aliceConversation, "user", {
      stickerRef: "pack:trophy",
      stickerUrl: "/stickers/fluent/trophy.svg",
    });
    const link = await addText(aliceConversation, "user", {
      body: "https://a.com/",
    });
    const ids = async (query: string) =>
      (await (await getTrainee(query)).json()).items.map(
        (item: { messageId: number }) => item.messageId,
      );

    expect(await ids("")).toEqual([photo.messageId]);
    expect(await ids("?tab=bogus")).toEqual([photo.messageId]);
    expect(await ids("?tab=stickers")).toEqual([sticker]);
    expect(await ids("?tab=links")).toEqual([link]);
  });

  it("keeps the admin access rules for every tab", async () => {
    await addText(aliceConversation, "user", { body: "https://a.com/" });
    await db.insert(adminHiddenUsers).values({ adminId: 1, userId: alice });

    asAdmin(1);
    expect((await getAdmin(aliceConversation, "?tab=links")).status).toBe(404);
    expect((await getAdmin(aliceConversation, "?tab=stickers")).status).toBe(
      404,
    );
    asAdmin(2);
    const response = await getAdmin(aliceConversation, "?tab=links");

    expect(response.status).toBe(200);
    expect((await response.json()).items).toHaveLength(1);
  });
});
