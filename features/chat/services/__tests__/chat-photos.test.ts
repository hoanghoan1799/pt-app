import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatMessages,
  chatPhotos,
  users,
} from "@/db/schema";
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_SIDE,
  PHOTO_PENDING_TTL_MS,
} from "@/features/chat/utils/photo-rules";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | {
    id: number;
    name: string;
    chatEnabled: boolean | null;
  },
  admin: null as null | { id: number },
  // Whether the admin revealed the hidden trainees with the passcode.
  revealed: false,
  schedulePush: null as unknown,
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
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => state.revealed),
}));
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

const upload = await import("@/app/api/chat/photos/route");
const serve = await import("@/app/api/chat/photos/[id]/route");
const actions = await import("@/features/chat/services/chat-actions");
const adminActions =
  await import("@/features/chat/services/chat-admin-actions");
const service = await import("@/features/chat/services/chat-photos");
const queries = await import("@/features/chat/services/chat-queries");
const { schedulePush } = await import("@/features/chat/services/chat-push");

let db: TestDb;
let alice: number;
let bob: number;
let locked: number;
let seq = 0;

const ascii = (text: string) => Array.from(text).map((c) => c.charCodeAt(0));
const be32 = (n: number) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];

// A PNG header with the given size, padded to `size` bytes.
const png = (width = 1200, height = 800, size = 64) => {
  const bytes = new Uint8Array(size);

  bytes.set([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    ...ascii("IHDR"),
    ...be32(width),
    ...be32(height),
  ]);
  return bytes;
};

const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const asUser = (id: number, chatEnabled: boolean | null = true) => {
  state.user = { id, name: "Học viên", chatEnabled };
  state.admin = null;
};

const asAdmin = (id: number) => {
  state.user = null;
  state.admin = { id };
};

const post = (
  body: BodyInit,
  { query = "", origin }: { query?: string; origin?: string } = {},
) =>
  upload.POST(
    new NextRequest(`http://localhost/api/chat/photos${query}`, {
      method: "POST",
      body,
      headers: origin ? { origin } : {},
    }),
  );

const get = (id: number | string) =>
  serve.GET(new NextRequest(`http://localhost/api/chat/photos/${id}`), {
    params: Promise.resolve({ id: String(id) }),
  });

const uploadAs = async (bytes = png(), query = "") => {
  const response = await post(bytes, { query });

  expect(response.status).toBe(201);
  return ((await response.json()) as { photo: { id: number } }).photo.id;
};

const sendPhoto = (photoId: number, extra: Record<string, unknown> = {}) =>
  actions.sendMessageAction({
    photoId,
    clientId: uuid(),
    ...extra,
  } as never);

const photoRows = () => db.select().from(chatPhotos);

beforeEach(async () => {
  vi.mocked(schedulePush).mockClear();
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
      { name: "Chi", nameKey: "chi", chatEnabled: false },
    ])
    .returning({ id: users.id });

  [alice, bob, locked] = rows.map((row) => row.id);
  asUser(alice);
});

describe("POST /api/chat/photos", () => {
  it("stores a pending photo and reads its type and size from the bytes", async () => {
    const response = await post(png(1500, 1000, 4096));
    const { photo } = await response.json();

    expect(response.status).toBe(201);
    const [row] = await photoRows();

    expect(row).toMatchObject({
      id: photo.id,
      mime: "image/png",
      width: 1500,
      height: 1000,
      size: 4096,
      messageId: null,
      uploaderKey: "user",
    });
    expect(row.data.length).toBe(4096);
  });

  it("ignores any size the client claims", async () => {
    const response = await post(png(300, 200), {
      query: "?width=1&height=1&mime=image/gif",
    });

    expect(response.status).toBe(201);
    expect((await photoRows())[0]).toMatchObject({
      mime: "image/png",
      width: 300,
      height: 200,
    });
  });

  it("rejects over the byte limit with 413 and stores nothing", async () => {
    const response = await post(png(100, 100, PHOTO_MAX_BYTES + 1));

    expect(response.status).toBe(413);
    expect(await photoRows()).toHaveLength(0);
  });

  it("accepts exactly the byte limit", async () => {
    expect((await post(png(100, 100, PHOTO_MAX_BYTES))).status).toBe(201);
  });

  it("rejects a long side above 1600 px, other formats and empty bodies", async () => {
    expect((await post(png(PHOTO_MAX_SIDE + 1, 100))).status).toBe(400);
    expect((await post(png(100, PHOTO_MAX_SIDE + 1))).status).toBe(400);
    expect((await post(new TextEncoder().encode("GIF89a......"))).status).toBe(
      400,
    );
    expect((await post(new Uint8Array(0))).status).toBe(400);
    expect(await photoRows()).toHaveLength(0);
  });

  it("is 401 without a session, 403 for a locked chat or a foreign origin", async () => {
    state.user = null;
    expect((await post(png())).status).toBe(401);
    asUser(locked, false);
    expect((await post(png())).status).toBe(403);
    asUser(alice);
    expect((await post(png(), { origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect(await photoRows()).toHaveLength(0);
  });

  it("lets a PT upload into a trainee's conversation, not a locked or missing one", async () => {
    asAdmin(1);
    const id = await uploadAs(png(), `?as=admin&userId=${alice}`);

    expect((await photoRows())[0]).toMatchObject({
      id,
      uploaderKey: "admin:1",
    });
    expect(
      (await post(png(), { query: `?as=admin&userId=${locked}` })).status,
    ).toBe(403);
    expect((await post(png(), { query: "?as=admin&userId=9999" })).status).toBe(
      401,
    );
    expect((await post(png(), { query: "?as=admin" })).status).toBe(401);
    // A trainee session cannot upload as an admin.
    asUser(alice);
    expect(
      (await post(png(), { query: `?as=admin&userId=${bob}` })).status,
    ).toBe(401);
  });

  it("refuses a PT upload into a trainee they hid", async () => {
    await db.insert(adminHiddenUsers).values({ adminId: 1, userId: alice });
    asAdmin(1);

    expect(
      (await post(png(), { query: `?as=admin&userId=${alice}` })).status,
    ).toBe(401);
    asAdmin(2);
    expect(
      (await post(png(), { query: `?as=admin&userId=${alice}` })).status,
    ).toBe(201);
  });

  it("drops uploads that never became a message once they are a day old", async () => {
    const old = await service.createPendingPhoto(
      {
        conversationId: 1,
        uploaderKey: "user",
        mime: "image/png",
        width: 1,
        height: 1,
        bytes: png(),
      },
      new Date(Date.now() - PHOTO_PENDING_TTL_MS - 1000),
    );

    await uploadAs();
    const ids = (await photoRows()).map((row) => row.id);

    expect(ids).not.toContain(old);
    expect(ids).toHaveLength(1);
  });
});

describe("sending a photo", () => {
  it("stores the message with the photo, attaches it and pushes 'photo'", async () => {
    const id = await uploadAs(png(1200, 800));
    const result = await sendPhoto(id);

    expect(result).toMatchObject({
      status: "success",
      message: {
        body: "",
        sticker: null,
        photo: {
          url: `/api/chat/photos/${id}`,
          width: 1200,
          height: 800,
        },
      },
    });
    const [message] = await db.select().from(chatMessages);

    expect(message.photoId).toBe(id);
    expect((await photoRows())[0].messageId).toBe(message.id);
    expect(schedulePush).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "user", photo: true }),
    );
  });

  it("keeps the optional text next to the photo", async () => {
    const id = await uploadAs();
    const result = await sendPhoto(id, { body: "  bữa trưa  " });

    expect(result).toMatchObject({
      status: "success",
      message: { body: "bữa trưa", photo: { url: `/api/chat/photos/${id}` } },
    });
  });

  it("answers a retried send with the stored message and pushes once", async () => {
    const id = await uploadAs();
    const clientId = uuid();
    const first = await sendPhoto(id, { clientId });
    const again = await sendPhoto(id, { clientId });

    expect(first.status).toBe("success");
    expect(again).toMatchObject({ status: "success" });
    expect((again as { message: { id: number } }).message.id).toBe(
      (first as { message: { id: number } }).message.id,
    );
    expect(await db.select().from(chatMessages)).toHaveLength(1);
    expect(schedulePush).toHaveBeenCalledTimes(1);
  });

  it("refuses a photo that is missing, already used, or another person's", async () => {
    const mine = await uploadAs();

    asUser(bob);
    const theirs = await uploadAs();

    // Bob cannot send Alice's pending upload.
    expect(await sendPhoto(mine)).toMatchObject({ status: "error" });
    expect(await sendPhoto(9999)).toMatchObject({ status: "error" });
    // A PT cannot attach a trainee's upload either.
    asAdmin(1);
    expect(
      await actions.adminSendMessageAction({
        userId: bob,
        photoId: theirs,
        clientId: uuid(),
      } as never),
    ).toMatchObject({ status: "error" });
    expect(await db.select().from(chatMessages)).toHaveLength(0);

    // The owner sends it once; a second message cannot reuse it.
    asUser(bob);
    expect((await sendPhoto(theirs)).status).toBe("success");
    expect(await sendPhoto(theirs)).toMatchObject({ status: "error" });
    expect(await db.select().from(chatMessages)).toHaveLength(1);
  });

  it("refuses a photo uploaded for another conversation", async () => {
    asAdmin(1);
    const forBob = await uploadAs(png(), `?as=admin&userId=${bob}`);

    asUser(alice);
    expect(await sendPhoto(forBob)).toMatchObject({ status: "error" });
    asAdmin(1);
    expect(
      await actions.adminSendMessageAction({
        userId: alice,
        photoId: forBob,
        clientId: uuid(),
      } as never),
    ).toMatchObject({ status: "error" });
  });

  it("refuses a photo together with a sticker, and a locked trainee", async () => {
    const id = await uploadAs();

    expect(await sendPhoto(id, { sticker: { customId: 1 } })).toMatchObject({
      status: "error",
    });
    asUser(alice, false);
    expect(await sendPhoto(id)).toMatchObject({ status: "error" });
    expect(await db.select().from(chatMessages)).toHaveLength(0);
  });

  it("lets a PT send a photo to a trainee", async () => {
    asAdmin(2);
    const id = await uploadAs(png(), `?as=admin&userId=${alice}`);
    const result = await actions.adminSendMessageAction({
      userId: alice,
      photoId: id,
      body: "form tốt",
      clientId: uuid(),
    } as never);

    expect(result).toMatchObject({
      status: "success",
      message: {
        senderRole: "admin",
        body: "form tốt",
        photo: { width: 1200 },
      },
    });
    expect(schedulePush).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "admin", photo: true }),
    );
  });
});

describe("GET /api/chat/photos/[id]", () => {
  let photoId: number;

  beforeEach(async () => {
    photoId = await uploadAs(png(900, 600));
    await sendPhoto(photoId);
  });

  it("serves the bytes to the trainee with long private cache headers", async () => {
    const response = await get(photoId);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await response.arrayBuffer()).byteLength).toBe(64);
  });

  it("is 404 for another trainee and 401 without a session", async () => {
    asUser(bob);
    expect((await get(photoId)).status).toBe(404);
    state.user = null;
    expect((await get(photoId)).status).toBe(401);
  });

  it("serves any admin who can access the trainee", async () => {
    asAdmin(1);
    expect((await get(photoId)).status).toBe(200);
    asAdmin(2);
    expect((await get(photoId)).status).toBe(200);
  });

  it("is 404 for the admin who hid the trainee until they reveal, but not for others", async () => {
    await db.insert(adminHiddenUsers).values({ adminId: 1, userId: alice });
    asAdmin(1);
    expect((await get(photoId)).status).toBe(404);
    asAdmin(2);
    expect((await get(photoId)).status).toBe(200);
    asAdmin(1);
    state.revealed = true;
    expect((await get(photoId)).status).toBe(200);
  });

  it("does not serve an upload that is not part of a message yet", async () => {
    const pending = await uploadAs();

    expect((await get(pending)).status).toBe(404);
    asAdmin(1);
    expect((await get(pending)).status).toBe(404);
  });

  it("is 404 for unknown and malformed ids", async () => {
    for (const id of ["9999", "0", "-1", "abc", "1e3", "0x10"]) {
      expect((await get(id)).status).toBe(404);
    }
  });
});

describe("unsending a photo message", () => {
  it("deletes the stored bytes, and the URL then answers 404", async () => {
    const id = await uploadAs();
    const sent = await sendPhoto(id);
    const messageId = (sent as { message: { id: number } }).message.id;

    expect((await get(id)).status).toBe(200);
    const result = await actions.unsendMessageAction({ messageId });

    expect(result).toMatchObject({
      status: "success",
      message: { deleted: true, photo: null },
    });
    expect(await photoRows()).toHaveLength(0);
    expect((await get(id)).status).toBe(404);
  });

  it("works for a PT unsending their own photo, and leaves other photos alone", async () => {
    const other = await uploadAs();

    await sendPhoto(other);
    asAdmin(1);
    const id = await uploadAs(png(), `?as=admin&userId=${alice}`);
    const sent = await actions.adminSendMessageAction({
      userId: alice,
      photoId: id,
      clientId: uuid(),
    } as never);
    const conversation = await queries.findConversationByUserId(alice);

    await adminActions.adminUnsendMessageAction({
      conversationId: conversation!.id,
      messageId: (sent as { message: { id: number } }).message.id,
    });

    expect((await photoRows()).map((row) => row.id)).toEqual([other]);
  });

  it("does not delete a photo when someone else tries to unsend the message", async () => {
    const id = await uploadAs();
    const sent = await sendPhoto(id);
    const messageId = (sent as { message: { id: number } }).message.id;

    asAdmin(1);
    const conversation = await queries.findConversationByUserId(alice);
    const result = await adminActions.adminUnsendMessageAction({
      conversationId: conversation!.id,
      messageId,
    });

    expect(result).toMatchObject({ status: "error" });
    expect(await photoRows()).toHaveLength(1);
  });
});

describe("inbox preview", () => {
  const previewOf = async () =>
    (await queries.listAdminInbox(1)).conversations[0].preview;

  it("shows '📷 Ảnh' for a photo alone and '📷 text' with a caption", async () => {
    await sendPhoto(await uploadAs());
    expect(await previewOf()).toBe("📷 Ảnh");

    await sendPhoto(await uploadAs(), { body: "bữa tối" });
    expect(await previewOf()).toBe("📷 bữa tối");
  });

  it("is empty after the photo is unsent", async () => {
    const sent = await sendPhoto(await uploadAs());

    await actions.unsendMessageAction({
      messageId: (sent as { message: { id: number } }).message.id,
    });
    expect(await previewOf()).toBe("");
  });

  it("marks a quoted photo", async () => {
    const sent = await sendPhoto(await uploadAs());
    const photoMessageId = (sent as { message: { id: number } }).message.id;
    const reply = await actions.sendMessageAction({
      body: "đẹp quá",
      replyToMessageId: photoMessageId,
      clientId: uuid(),
    } as never);

    expect(reply).toMatchObject({
      message: { replyTo: { id: photoMessageId, isPhoto: true } },
    });
  });
});

describe("photo ownership rows", () => {
  it("only the attached message points at the photo", async () => {
    const id = await uploadAs();
    const sent = await sendPhoto(id);
    const [row] = await db
      .select()
      .from(chatPhotos)
      .where(eq(chatPhotos.id, id));

    expect(row.messageId).toBe(
      (sent as { message: { id: number } }).message.id,
    );
  });
});
