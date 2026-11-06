import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  chatConversations,
  chatCustomStickers,
  chatMessages,
  users,
} from "@/db/schema";
import { CUSTOM_STICKER_MAX_BYTES } from "@/features/chat/utils/custom-sticker-rules";

const state = vi.hoisted(() => ({
  db: null as unknown,
  // Who the API routes see.
  user: null as null | { id: number; chatEnabled: boolean | null },
  admin: null as null | { id: number },
  // Who the server actions see.
  role: "user" as "user" | "admin",
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
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
  requireUser: vi.fn(async () => state.user),
  requireAdmin: vi.fn(async () => state.admin),
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

const list = await import("@/app/api/chat/stickers/custom/route");
const one = await import("@/app/api/chat/stickers/custom/[id]/route");
const actions = await import("@/features/chat/services/chat-actions");
const service = await import("@/features/chat/services/custom-stickers");

let db: TestDb;
let alice: number;
let bob: number;

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size = 64) => {
  const bytes = new Uint8Array(size);

  bytes.set(PNG_HEAD);
  return bytes;
};

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const url = (path = "", query = "") =>
  `http://localhost/api/chat/stickers/custom${path}${query}`;

const post = (
  body: BodyInit,
  { query = "", origin }: { query?: string; origin?: string } = {},
) =>
  list.POST(
    new NextRequest(url("", query), {
      method: "POST",
      body,
      headers: origin ? { origin } : {},
    }),
  );

const serve = (id: number | string) =>
  one.GET(new NextRequest(url(`/${id}`)), {
    params: Promise.resolve({ id: String(id) }),
  });

const remove = (id: number | string, query = "") =>
  one.DELETE(new NextRequest(url(`/${id}`, query), { method: "DELETE" }), {
    params: Promise.resolve({ id: String(id) }),
  });

const asUser = (id: number) => {
  state.user = { id, chatEnabled: true };
  state.admin = null;
  state.role = "user";
};

const asAdmin = (id = 9) => {
  state.user = null;
  state.admin = { id };
  state.role = "admin";
};

const createFor = async (
  kind: "user" | "admin",
  ownerId: number,
  bytes = png(),
) => {
  const result = await service.createOwnSticker(
    { kind, id: ownerId },
    { mime: "image/png", bytes },
  );

  if (result.status !== "created") {
    throw new Error("limit");
  }
  return result.id;
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  const rows = await db
    .insert(users)
    .values([
      { name: "An", nameKey: "an", chatEnabled: true },
      { name: "Bình", nameKey: "binh", chatEnabled: true },
    ])
    .returning({ id: users.id });

  alice = rows[0].id;
  bob = rows[1].id;
  asUser(alice);
});

describe("POST /api/chat/stickers/custom", () => {
  it("stores a PNG and lists it for its owner only", async () => {
    const response = await post(png());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sticker.url).toBe(
      `/api/chat/stickers/custom/${body.sticker.id}`,
    );
    expect(
      (await (await list.GET(new NextRequest(url()))).json()).stickers,
    ).toEqual([body.sticker]);

    asUser(bob);
    expect(
      (await (await list.GET(new NextRequest(url()))).json()).stickers,
    ).toEqual([]);
  });

  it("takes the type from the bytes, not from the client", async () => {
    const jpeg = new Uint8Array(64);

    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    const response = await post(jpeg);

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/WebP hoặc PNG/);
    expect(await db.select().from(chatCustomStickers)).toHaveLength(0);
  });

  it("rejects an image over the size limit", async () => {
    const response = await post(png(CUSTOM_STICKER_MAX_BYTES + 1));

    expect(response.status).toBe(413);
    expect(await db.select().from(chatCustomStickers)).toHaveLength(0);
  });

  it("is 401 without a session and 403 for a locked chat or a foreign origin", async () => {
    state.user = null;
    expect((await post(png())).status).toBe(401);
    state.user = { id: alice, chatEnabled: false };
    expect((await post(png())).status).toBe(403);
    asUser(alice);
    expect((await post(png(), { origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect(await db.select().from(chatCustomStickers)).toHaveLength(0);
  });

  it("allows 30 per owner and rejects the 31st with a Vietnamese message", async () => {
    for (let n = 0; n < 30; n += 1) {
      expect((await post(png())).status).toBe(201);
    }
    const response = await post(png());

    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("tối đa 30 sticker");
    // Another person's set is separate.
    asUser(bob);
    expect((await post(png())).status).toBe(201);
  });

  it("keeps the trainee set and the PT set apart, even for the same id", async () => {
    const mine = await createFor("user", alice);

    asAdmin(alice);
    expect(
      (await (await list.GET(new NextRequest(url("", "?as=admin")))).json())
        .stickers,
    ).toEqual([]);
    expect((await remove(mine, "?as=admin")).status).toBe(404);
    expect(await db.select().from(chatCustomStickers)).toHaveLength(1);
  });
});

describe("DELETE /api/chat/stickers/custom/[id]", () => {
  it("really deletes a sticker that was never sent", async () => {
    const id = await createFor("user", alice);

    expect((await remove(id)).status).toBe(200);
    expect(await db.select().from(chatCustomStickers)).toHaveLength(0);
  });

  it("cannot delete someone else's sticker or a bad id", async () => {
    const id = await createFor("user", alice);

    asUser(bob);
    expect((await remove(id)).status).toBe(404);
    expect((await remove("abc")).status).toBe(404);
    expect((await remove("0")).status).toBe(404);
    expect(await db.select().from(chatCustomStickers)).toHaveLength(1);
  });

  it("only hides a sticker already sent, so the chat keeps its picture", async () => {
    const id = await createFor("user", alice);
    const sent = await actions.sendMessageAction({
      sticker: { customId: id },
      clientId: uuid(1),
    } as never);

    expect(sent.status).toBe("success");
    expect((await remove(id)).status).toBe(200);
    expect(
      (await (await list.GET(new NextRequest(url()))).json()).stickers,
    ).toEqual([]);
    const [row] = await db
      .select()
      .from(chatCustomStickers)
      .where(eq(chatCustomStickers.id, id));

    expect(row.deletedAt).not.toBeNull();
    // The conversation still shows it to the trainee ...
    expect((await serve(id)).status).toBe(200);
    // ... but it can no longer be sent.
    const again = await actions.sendMessageAction({
      sticker: { customId: id },
      clientId: uuid(2),
    } as never);

    expect(again).toMatchObject({ status: "error" });
  });
});

describe("sending a personal sticker", () => {
  it("stores custom:<id> with the serve-route URL", async () => {
    const id = await createFor("user", alice);
    const result = await actions.sendMessageAction({
      sticker: { customId: id },
      clientId: uuid(1),
    } as never);

    expect(result).toMatchObject({
      status: "success",
      message: {
        body: "",
        sticker: { kind: "custom", url: `/api/chat/stickers/custom/${id}` },
      },
    });
    expect((await db.select().from(chatMessages))[0]).toMatchObject({
      stickerRef: `custom:${id}`,
      stickerUrl: `/api/chat/stickers/custom/${id}`,
    });
  });

  it("refuses a sticker owned by someone else, or one that does not exist", async () => {
    const theirs = await createFor("user", bob);
    const adminsOwn = await createFor("admin", alice);

    for (const [n, customId] of [theirs, adminsOwn, 9999].entries()) {
      const result = await actions.sendMessageAction({
        sticker: { customId },
        clientId: uuid(n + 1),
      } as never);

      expect(result).toMatchObject({ status: "error" });
    }
    expect(await db.select().from(chatMessages)).toHaveLength(0);
  });

  it("refuses a data URL smuggled next to the id", async () => {
    const id = await createFor("user", alice);
    const result = await actions.sendMessageAction({
      sticker: { customId: id, url: "data:image/png;base64,AAAA" },
      clientId: uuid(1),
    } as never);

    // The unknown key is dropped by the schema; only the route URL is stored.
    expect(result.status).toBe("success");
    expect((await db.select().from(chatMessages))[0].stickerUrl).toBe(
      `/api/chat/stickers/custom/${id}`,
    );
  });

  it("lets a PT send their own sticker into a trainee's conversation", async () => {
    const id = await createFor("admin", 9);

    asAdmin(9);
    const result = await actions.adminSendMessageAction({
      userId: alice,
      sticker: { customId: id },
      clientId: uuid(1),
    } as never);

    expect(result.status).toBe("success");
    const other = await createFor("user", alice);
    const denied = await actions.adminSendMessageAction({
      userId: alice,
      sticker: { customId: other },
      clientId: uuid(2),
    } as never);

    expect(denied).toMatchObject({ status: "error" });
  });
});

describe("GET /api/chat/stickers/custom/[id]", () => {
  const sendIn = async (customId: number) =>
    actions.sendMessageAction({
      sticker: { customId },
      clientId: uuid(50),
    } as never);

  it("serves the bytes with the stored type and a private immutable cache", async () => {
    const id = await createFor("user", alice, png(80));
    const response = await serve(id);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png(80));
  });

  it("is 401 without a session and 404 for a bad or unknown id", async () => {
    const id = await createFor("user", alice);

    state.user = null;
    expect((await serve(id)).status).toBe(401);
    asUser(alice);
    expect((await serve("abc")).status).toBe(404);
    expect((await serve(9999)).status).toBe(404);
  });

  it("hides an unsent-to-anyone sticker from other trainees and from the PT", async () => {
    const id = await createFor("user", alice);

    asUser(bob);
    expect((await serve(id)).status).toBe(404);
    asAdmin();
    expect((await serve(id)).status).toBe(404);
  });

  it("shows a sent sticker to the PT and to the trainee of that conversation only", async () => {
    // The PT sends it to Alice.
    const adminSticker = await createFor("admin", 9);

    asAdmin(9);
    await actions.adminSendMessageAction({
      userId: alice,
      sticker: { customId: adminSticker },
      clientId: uuid(1),
    } as never);

    asUser(alice);
    expect((await serve(adminSticker)).status).toBe(200);
    asUser(bob);
    expect((await serve(adminSticker)).status).toBe(404);

    // Alice sends hers; the PT sees it, Bob does not.
    asUser(alice);
    const mine = await createFor("user", alice);

    await sendIn(mine);
    asAdmin(3);
    expect((await serve(mine)).status).toBe(200);
    asUser(bob);
    expect((await serve(mine)).status).toBe(404);
  });

  it("stops showing a sticker once its message is unsent", async () => {
    const id = await createFor("user", alice);

    await sendIn(id);
    await db.update(chatMessages).set({ deletedAt: new Date() });
    await db
      .update(chatCustomStickers)
      .set({ deletedAt: new Date() })
      .where(eq(chatCustomStickers.id, id));
    asAdmin();
    expect((await serve(id)).status).toBe(404);
    asUser(alice);
    expect((await serve(id)).status).toBe(404);
  });

  it("does not leak through another trainee's conversation id", async () => {
    const id = await createFor("user", alice);

    await sendIn(id);
    const [conversation] = await db.select().from(chatConversations);

    expect(conversation.userId).toBe(alice);
    asUser(bob);
    expect((await serve(id)).status).toBe(404);
  });
});
