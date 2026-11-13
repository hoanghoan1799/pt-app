import type { INestApplication } from "@nestjs/common";
import { CHAT_PHOTO_ERRORS } from "@pt/contracts";
import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { ChatMessage } from "../src/database/entities/chat-message.entity.js";
import { ChatPhoto } from "../src/database/entities/chat-photo.entity.js";
import { createTestApp } from "./support/app.js";
import {
  FakeClock,
  hideTrainee,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import {
  callWith,
  captureEvents,
  enableChat,
  ensureConversation,
  GIF_BYTES,
  jpegBytes,
  newKey,
  pngBytes,
  upload,
} from "./support/chat.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { linkPhoto } from "./support/rows.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let clock: FakeClock;
let events: ReturnType<typeof captureEvents>;

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  clock = new FakeClock();
  app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: Clock, value: clock }],
  });
  events = captureEvents(app);
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(() => {
  events.clear();
});

const trainee = async (
  options: { ptAdminId?: number; chat?: boolean } = {},
) => {
  const row = await seedUser(ds, { ptAdminId: options.ptAdminId ?? null });

  if (options.chat !== false) {
    await enableChat(ds, row.id);
  }
  return { ...row, token: await tokenOf(app, { kind: "user", ...row }) };
};

const admin = async (role: "super_admin" | "pt" = "pt", passcode?: string) => {
  const row = await seedAdmin(ds, { role, passcode });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

const send = (
  token: string,
  body: object,
  path = "/v1/chat/conversations/me/messages",
) =>
  callWith(app, "post", path, token, {
    body,
    headers: { "Idempotency-Key": newKey() },
  });

const uploadMine = (token: string, bytes: Buffer, headers = {}) =>
  upload(app, "/v1/chat/photos", token, bytes, headers);

const getPhoto = (token: string | null, id: number | string) =>
  callWith(app, "get", `/v1/chat/photos/${id}`, token);

describe("POST /v1/chat/photos", () => {
  it("stores a pending photo reading type and size from the bytes", async () => {
    const me = await trainee();
    const bytes = pngBytes(640, 480, 5000);
    const response = await uploadMine(me.token, bytes);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body)).toEqual(["photo"]);
    const row = await ds
      .getRepository(ChatPhoto)
      .findOneByOrFail({ id: response.body.photo.id });

    expect(row).toMatchObject({
      mime: "image/png",
      width: 640,
      height: 480,
      size: 5000,
      uploaderKey: "user",
      messageId: null,
      clientId: null,
    });
    expect(Buffer.compare(row.data, bytes)).toBe(0);
  });

  it("ignores what the client claims about the type", async () => {
    const me = await trainee();
    const response = await upload(
      app,
      "/v1/chat/photos",
      me.token,
      jpegBytes(),
      {},
      "image/png",
    );

    expect(response.status).toBe(201);
    const row = await ds
      .getRepository(ChatPhoto)
      .findOneByOrFail({ id: response.body.photo.id });

    expect(row).toMatchObject({ mime: "image/jpeg", width: 4, height: 3 });
  });

  it("accepts exactly 1.5 MB and rejects one byte more with 413 and the Vietnamese message", async () => {
    const me = await trainee();
    const limit = 1.5 * 1024 * 1024;

    expect((await uploadMine(me.token, pngBytes(10, 10, limit))).status).toBe(
      201,
    );
    const before = await ds.getRepository(ChatPhoto).count();
    const over = await uploadMine(me.token, pngBytes(10, 10, limit + 1));

    expect(over.status).toBe(413);
    expect(over.body).toMatchObject({
      code: "PHOTO_TOO_LARGE",
      message: CHAT_PHOTO_ERRORS.TOO_LARGE,
    });
    expect(await ds.getRepository(ChatPhoto).count()).toBe(before);
  });

  it("rejects a long side above 1600 px, other formats and an empty body with 400", async () => {
    const me = await trainee();

    expect((await uploadMine(me.token, pngBytes(1601, 10))).status).toBe(400);
    expect((await uploadMine(me.token, pngBytes(1600, 1600))).status).toBe(201);
    expect((await uploadMine(me.token, pngBytes(0, 10))).status).toBe(400);
    const gif = await uploadMine(me.token, GIF_BYTES);

    expect(gif.status).toBe(400);
    expect(gif.body).toMatchObject({
      code: "BAD_IMAGE",
      message: CHAT_PHOTO_ERRORS.BAD_IMAGE,
    });
    expect((await uploadMine(me.token, Buffer.alloc(0))).status).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .post("/v1/chat/photos")
          .set("Authorization", `Bearer ${me.token}`)
          .send({ not: "bytes" })
      ).status,
    ).toBe(400);
  });

  it("is 401 without a session, 403 to an admin on the trainee route and 403 while locked", async () => {
    const me = await trainee();
    const locked = await trainee({ chat: false });
    const pt = await admin();

    expect((await upload(app, "/v1/chat/photos", "", pngBytes())).status).toBe(
      401,
    );
    expect((await uploadMine(pt.token, pngBytes())).status).toBe(403);
    const response = await uploadMine(locked.token, pngBytes());

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CHAT_LOCKED");
    expect((await uploadMine(me.token, pngBytes())).status).toBe(201);
  });

  it("answers a retried Idempotency-Key with the first photo and stores no duplicate", async () => {
    const me = await trainee();
    const key = newKey();
    const first = await uploadMine(me.token, pngBytes(8, 8, 100), {
      "Idempotency-Key": key,
    });
    const second = await uploadMine(me.token, pngBytes(8, 8, 100), {
      "Idempotency-Key": key,
    });
    const other = await uploadMine(me.token, pngBytes(8, 8, 100), {
      "Idempotency-Key": newKey(),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.photo.id).toBe(first.body.photo.id);
    expect(other.body.photo.id).not.toBe(first.body.photo.id);
    expect(await ds.getRepository(ChatPhoto).countBy({ clientId: key })).toBe(
      1,
    );
    expect(
      (
        await uploadMine(me.token, pngBytes(), {
          "Idempotency-Key": "bad key!",
        })
      ).status,
    ).toBe(400);
  });

  it("drops uploads that never became a message once they are a day old", async () => {
    const me = await trainee();
    const old = await uploadMine(me.token, pngBytes());

    clock.advance(25 * 60 * 60 * 1000);
    const fresh = await uploadMine(me.token, pngBytes());

    expect(
      await ds.getRepository(ChatPhoto).existsBy({ id: old.body.photo.id }),
    ).toBe(false);
    expect(
      await ds.getRepository(ChatPhoto).existsBy({ id: fresh.body.photo.id }),
    ).toBe(true);
  });

  it("lets a PT upload into a trainee's conversation within the scope", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const locked = await trainee({ ptAdminId: pt.id, chat: false });
    const path = (id: number) => `/v1/chat/trainees/${id}/photos`;

    const ok = await upload(app, path(me.id), pt.token, pngBytes());

    expect(ok.status).toBe(201);
    expect(
      (
        await ds
          .getRepository(ChatPhoto)
          .findOneByOrFail({ id: ok.body.photo.id })
      ).uploaderKey,
    ).toBe(`admin:${pt.id}`);
    expect(
      (await upload(app, path(me.id), other.token, pngBytes())).status,
    ).toBe(404);
    expect(
      (await upload(app, path(locked.id), pt.token, pngBytes())).body.code,
    ).toBe("CHAT_LOCKED");
    expect((await upload(app, path(me.id), me.token, pngBytes())).status).toBe(
      403,
    );
  });

  it("refuses a PT upload into a trainee they hid until the reveal", async () => {
    const pt = await admin("pt", "1234");
    const me = await trainee({ ptAdminId: pt.id });

    await hideTrainee(ds, pt.id, me.id);
    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });
    expect(
      (
        await upload(
          app,
          `/v1/chat/trainees/${me.id}/photos`,
          pt.token,
          pngBytes(),
        )
      ).status,
    ).toBe(404);
    await callWith(app, "post", "/v1/admins/me/hidden-users/reveal", pt.token, {
      body: { passcode: "1234" },
    });
    expect(
      (
        await upload(
          app,
          `/v1/chat/trainees/${me.id}/photos`,
          pt.token,
          pngBytes(),
        )
      ).status,
    ).toBe(201);
  });
});

describe("sending a photo", () => {
  it("attaches the photo, keeps the caption and emits hasPhoto", async () => {
    const me = await trainee();
    const photo = await uploadMine(me.token, pngBytes(30, 20));
    const sent = await send(me.token, {
      photoId: photo.body.photo.id,
      body: "bữa trưa",
    });

    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({
      body: "bữa trưa",
      photo: {
        url: `/v1/chat/photos/${photo.body.photo.id}`,
        width: 30,
        height: 20,
        alt: "Ảnh trong tin nhắn",
      },
    });
    expect(
      (
        await ds
          .getRepository(ChatPhoto)
          .findOneByOrFail({ id: photo.body.photo.id })
      ).messageId,
    ).toBe(sent.body.message.id);
    expect(events.named("chat.message.sent")[0].payload).toMatchObject({
      hasPhoto: true,
      body: "bữa trưa",
    });
  });

  it("sends a photo alone and a photo with /imlang as a silent caption", async () => {
    const me = await trainee();
    const a = await uploadMine(me.token, pngBytes());
    const b = await uploadMine(me.token, pngBytes());
    const alone = await send(me.token, { photoId: a.body.photo.id });
    const silent = await send(me.token, {
      photoId: b.body.photo.id,
      body: "/imlang xem nè",
    });

    expect(alone.body.message.body).toBe("");
    expect(alone.body.message.photo).not.toBeNull();
    expect(silent.body.message.body).toBe("xem nè");
    expect(events.named("chat.message.sent")[1].payload.silent).toBe(true);
  });

  it("answers a retried send with the stored message and attaches once", async () => {
    const me = await trainee();
    const photo = await uploadMine(me.token, pngBytes());
    const key = newKey();
    const headers = { "Idempotency-Key": key };
    const body = { photoId: photo.body.photo.id };
    const first = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/messages",
      me.token,
      { body, headers },
    );
    const second = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/messages",
      me.token,
      { body, headers },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.message.id).toBe(first.body.message.id);
    expect(events.named("chat.message.sent")).toHaveLength(1);
  });

  it("refuses a photo that is missing, already used, another person's or for another conversation", async () => {
    const me = await trainee();
    const other = await trainee();
    const pt = await admin("super_admin");
    const mine = await uploadMine(me.token, pngBytes());
    const theirs = await uploadMine(other.token, pngBytes());
    const ptPhoto = await upload(
      app,
      `/v1/chat/trainees/${me.id}/photos`,
      pt.token,
      pngBytes(),
    );

    await send(me.token, { photoId: mine.body.photo.id });

    for (const photoId of [
      999999,
      mine.body.photo.id,
      theirs.body.photo.id,
      ptPhoto.body.photo.id,
    ]) {
      const response = await send(me.token, { photoId });

      expect(response.status, String(photoId)).toBe(400);
      expect(response.body.code).toBe("CHAT_INVALID_INPUT");
    }
    // The PT's own photo can be sent by the PT, not by the trainee.
    const sent = await send(
      pt.token,
      { photoId: ptPhoto.body.photo.id },
      `/v1/chat/trainees/${me.id}/messages`,
    );

    expect(sent.status).toBe(201);
    expect(sent.body.message.senderRole).toBe("admin");
  });

  it("refuses a photo together with a sticker, and a locked trainee", async () => {
    const me = await trainee();
    const photo = await uploadMine(me.token, pngBytes());

    expect(
      (
        await send(me.token, {
          photoId: photo.body.photo.id,
          sticker: { pack: "fluent", id: "fire" },
        })
      ).status,
    ).toBe(400);
    await enableChat(ds, me.id, false);
    expect(
      (await send(me.token, { photoId: photo.body.photo.id })).body.code,
    ).toBe("CHAT_LOCKED");
  });
});

describe("GET /v1/chat/photos/:id", () => {
  const sentPhoto = async (owner: Awaited<ReturnType<typeof trainee>>) => {
    const bytes = pngBytes(12, 9, 300);
    const uploaded = await uploadMine(owner.token, bytes);
    const sent = await send(owner.token, { photoId: uploaded.body.photo.id });

    return {
      id: uploaded.body.photo.id as number,
      bytes,
      messageId: sent.body.message.id as number,
    };
  };

  it("serves the bytes to the trainee with long private cache headers", async () => {
    const me = await trainee();
    const { id, bytes } = await sentPhoto(me);
    const response = await getPhoto(me.token, id);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toBe(
      "default-src 'none'; sandbox",
    );
    expect(Buffer.compare(response.body, bytes)).toBe(0);
  });

  it("is 404 for another trainee and 401 without a session, 404 for unknown or pending ids", async () => {
    const me = await trainee();
    const other = await trainee();
    const { id } = await sentPhoto(me);
    const pending = await uploadMine(me.token, pngBytes());

    expect((await getPhoto(other.token, id)).status).toBe(404);
    expect((await getPhoto(null, id)).status).toBe(401);
    expect((await getPhoto(me.token, 999999)).status).toBe(404);
    expect((await getPhoto(me.token, pending.body.photo.id)).status).toBe(404);
    expect((await getPhoto(me.token, "abc")).status).toBe(400);
  });

  it("serves the PT of the trainee and any super admin, not another PT", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const boss = await admin("super_admin");
    const me = await trainee({ ptAdminId: pt.id });
    const { id } = await sentPhoto(me);

    expect((await getPhoto(pt.token, id)).status).toBe(200);
    expect((await getPhoto(boss.token, id)).status).toBe(200);
    expect((await getPhoto(other.token, id)).status).toBe(404);
  });

  it("is 404 for the PT who hid the trainee until they reveal", async () => {
    const pt = await admin("pt", "1234");
    const me = await trainee({ ptAdminId: pt.id });
    const { id } = await sentPhoto(me);

    await hideTrainee(ds, pt.id, me.id);
    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });
    expect((await getPhoto(pt.token, id)).status).toBe(404);
    await callWith(app, "post", "/v1/admins/me/hidden-users/reveal", pt.token, {
      body: { passcode: "1234" },
    });
    expect((await getPhoto(pt.token, id)).status).toBe(200);
  });

  it("is deleted for good, bytes included, when the message is unsent", async () => {
    const me = await trainee();
    const { id, messageId } = await sentPhoto(me);

    await callWith(app, "delete", `/v1/chat/messages/${messageId}`, me.token);
    expect((await getPhoto(me.token, id)).status).toBe(404);
    expect(await ds.getRepository(ChatPhoto).existsBy({ id })).toBe(false);
    const stored = await ds
      .getRepository(ChatMessage)
      .findOneByOrFail({ id: messageId });

    expect(stored.photoId).toBeNull();
    // Another person's unsend does not delete it.
    const again = await sentPhoto(me);

    await callWith(
      app,
      "delete",
      `/v1/chat/messages/${again.messageId}`,
      (await trainee()).token,
    );
    expect((await getPhoto(me.token, again.id)).status).toBe(200);
  });
});

const seedPhotoMessages = async (
  conversationId: number,
  count: number,
  senderRole: "user" | "admin" = "user",
  senderAdminId: number | null = null,
) => {
  const ids: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const message = await ds.getRepository(ChatMessage).save({
      conversationId,
      senderRole,
      senderAdminId,
      body: "",
      clientId: `gal-${conversationId}-${index}-${newKey()}`,
      createdAt: clock.now(),
    });
    const photo = await ds.getRepository(ChatPhoto).save({
      conversationId,
      uploaderKey: "user",
      mime: "image/png",
      width: 10 + index,
      height: 20,
      data: pngBytes(),
      size: pngBytes().length,
      createdAt: clock.now(),
    });

    await linkPhoto(ds, "chat", message.id, photo.id);
    ids.push(message.id);
  }
  return ids;
};

describe("gallery", () => {
  it("lists photos newest first with the sender, and pages by cursor with no gaps", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await seedPhotoMessages(conversationId, 61);
    const fromPt = await seedPhotoMessages(conversationId, 1, "admin", pt.id);
    const get = (query = "") =>
      callWith(
        app,
        "get",
        `/v1/chat/conversations/me/gallery${query}`,
        me.token,
      );

    const first = await get();

    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(60);
    expect(first.body.items[0]).toMatchObject({
      messageId: fromPt[0],
      senderKey: `admin:${pt.id}`,
      senderName: pt.username,
      width: 10,
      height: 20,
    });
    expect(first.body.items[1].senderKey).toBe("user");
    expect(first.body.items[1].senderName).toBe(me.name);
    expect(first.body.nextCursor).toBe(first.body.items[59].messageId);
    const second = await get(`?before=${first.body.nextCursor}`);
    const all = [...first.body.items, ...second.body.items].map(
      (item: { messageId: number }) => item.messageId,
    );

    expect(second.body.nextCursor).toBeNull();
    expect(all).toEqual([...fromPt, ...[...mine].reverse()]);
    expect(first.body.items[0].url).toBe(
      `/v1/chat/photos/${first.body.items[0].photoId}`,
    );
  });

  it("has no next page when the photos fill exactly one page, and leaves out unsent photos", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const ids = await seedPhotoMessages(conversationId, 60);
    const get = () =>
      callWith(app, "get", "/v1/chat/conversations/me/gallery", me.token);

    expect((await get()).body.nextCursor).toBeNull();
    await ds
      .getRepository(ChatMessage)
      .update({ id: ids[59] }, { deletedAt: clock.now() });
    const response = await get();

    expect(response.body.items).toHaveLength(59);
    expect(response.body.items[0].messageId).toBe(ids[58]);
  });

  it("lists stickers of every kind and skips a row whose ref and URL disagree", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const insert = (ref: string, url: string | null) =>
      ds.getRepository(ChatMessage).save({
        conversationId,
        senderRole: "user",
        body: "",
        stickerRef: ref,
        stickerUrl: url,
        clientId: newKey(),
        createdAt: clock.now(),
      });

    const pack = await insert("pack:fire", "/stickers/fluent/fire.svg");
    const giphy = await insert(
      "giphy:abc123",
      "https://media2.giphy.com/media/abc123/giphy.gif",
    );
    const custom = await insert("custom:77", "/api/chat/stickers/custom/77");
    await insert("giphy:evil", "https://evil.example.com/x.gif");
    await insert("pack:fire", "/stickers/other/fire.svg");
    const response = await callWith(
      app,
      "get",
      "/v1/chat/conversations/me/gallery?tab=stickers",
      me.token,
    );

    expect(
      response.body.items.map((item: { messageId: number }) => item.messageId),
    ).toEqual([custom.id, giphy.id, pack.id]);
    expect(response.body.items[0]).toMatchObject({
      kind: "custom",
      url: "/v1/chat/stickers/custom/77",
      alt: "Sticker của tôi",
    });
    expect(response.body.items[1]).toMatchObject({
      kind: "giphy",
      alt: "Sticker GIPHY",
    });
    expect(response.body.items[2]).toMatchObject({ kind: "pack", alt: "Lửa" });
  });

  it("gives one row per URL of live text messages and pages by message", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const insert = (body: string, extra: Partial<ChatMessage> = {}) =>
      ds.getRepository(ChatMessage).save({
        conversationId,
        senderRole: "user",
        body,
        clientId: newKey(),
        createdAt: clock.now(),
        ...extra,
      });

    await insert("không có link, chỉ nhắc http thôi");
    const two = await insert("xem https://example.com/a và www.example.org/b.");
    const gone = await insert("https://deleted.example.com", {
      deletedAt: clock.now(),
    });
    const one = await insert("(https://example.com/c)");
    const response = await callWith(
      app,
      "get",
      "/v1/chat/conversations/me/gallery?tab=links",
      me.token,
    );

    expect(gone.id).toBeGreaterThan(two.id);
    expect(
      response.body.items.map((item: { href: string }) => item.href),
    ).toEqual([
      "https://example.com/c",
      "https://example.com/a",
      "https://www.example.org/b",
    ]);
    expect(response.body.items[0]).toMatchObject({
      messageId: one.id,
      domain: "example.com",
      text: "https://example.com/c",
      key: `${one.id}:https://example.com/c`,
    });
    expect(response.body.nextCursor).toBeNull();
  });

  it("treats an unknown tab as photos and is empty without a conversation", async () => {
    const me = await trainee();
    const get = (query: string) =>
      callWith(
        app,
        "get",
        `/v1/chat/conversations/me/gallery${query}`,
        me.token,
      );

    expect((await get("")).body).toEqual({ items: [], nextCursor: null });
    expect((await get("?tab=whatever")).body).toEqual({
      items: [],
      nextCursor: null,
    });
    expect((await get("?before=abc")).status).toBe(400);
    expect((await get("?before=0")).status).toBe(400);
    expect(
      (await callWith(app, "get", "/v1/chat/conversations/me/gallery", null))
        .status,
    ).toBe(401);
  });

  it("follows the PT scope for a conversation id", async () => {
    const pt = await admin("pt", "1234");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);

    await seedPhotoMessages(conversationId, 2);
    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });
    const get = (token: string, id = conversationId) =>
      callWith(app, "get", `/v1/chat/conversations/${id}/gallery`, token);

    expect((await get(pt.token)).body.items).toHaveLength(2);
    expect((await get(other.token)).status).toBe(404);
    expect((await get(pt.token, 999999)).status).toBe(404);
    expect((await get(me.token)).status).toBe(403);
    await hideTrainee(ds, pt.id, me.id);
    expect((await get(pt.token)).status).toBe(404);
    await callWith(app, "post", "/v1/admins/me/hidden-users/reveal", pt.token, {
      body: { passcode: "1234" },
    });
    expect((await get(pt.token)).status).toBe(200);
  });
});

describe("search", () => {
  const seedText = async (
    conversationId: number,
    texts: string[],
    extra: Partial<ChatMessage> = {},
  ) => {
    const ids: number[] = [];

    for (const body of texts) {
      ids.push(
        (
          await ds.getRepository(ChatMessage).save({
            conversationId,
            senderRole: "user",
            body,
            clientId: newKey(),
            createdAt: clock.now(),
            ...extra,
          })
        ).id,
      );
    }
    return ids;
  };
  const search = (token: string, q: string, extra = "") =>
    callWith(
      app,
      "get",
      `/v1/chat/conversations/me/search?q=${encodeURIComponent(q)}${extra}`,
      token,
    );

  it("finds 'ăn' with 'an' and 'đồ' with 'do', newest first", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const [a, b, c] = await seedText(conversationId, [
      "Đồ ĂN hôm nay",
      "hello you",
      "ăn đồ ngon",
    ]);
    const byAn = await search(me.token, "an");
    const byDo = await search(me.token, "do an");

    expect(
      byAn.body.results.map((r: { messageId: number }) => r.messageId),
    ).toEqual([c, a]);
    expect(
      byDo.body.results.map((r: { messageId: number }) => r.messageId),
    ).toEqual([a]);
    expect((await search(me.token, "Đ")).status).toBe(400);
    expect((await search(me.token, "đồ")).body.results).toHaveLength(2);
    expect(b).toBeGreaterThan(a);
  });

  it("matches text stored in decomposed (NFD) form too", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const [id] = await seedText(conversationId, [
      "Tập Đùi sau".normalize("NFD"),
    ]);
    const response = await search(me.token, "dui sau");

    expect(
      response.body.results.map((r: { messageId: number }) => r.messageId),
    ).toEqual([id]);
  });

  it("returns the sender, a snippet with the match as written and the time", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const long = `${"a ".repeat(30)}Hôm nay Tập Chân ${"b ".repeat(30)}`;
    const [byUser] = await seedText(conversationId, [long]);
    const [byPt] = await seedText(conversationId, ["PT: tap chan nhé"], {
      senderRole: "admin",
      senderAdminId: pt.id,
    });
    const response = await search(me.token, "tập chân");

    expect(response.body.results).toEqual([
      {
        messageId: byPt,
        senderRole: "admin",
        senderAdminId: pt.id,
        senderName: pt.username,
        snippet: { before: "PT: ", match: "tap chan", after: " nhé" },
        createdAt: clock.now().toISOString(),
      },
      {
        messageId: byUser,
        senderRole: "user",
        senderAdminId: null,
        senderName: null,
        snippet: {
          // 40 characters of context on each side.
          before: `…${"a ".repeat(16)}Hôm nay `,
          match: "Tập Chân",
          after: `${" b".repeat(20)}…`,
        },
        createdAt: clock.now().toISOString(),
      },
    ]);
  });

  it("leaves out unsent messages, stickers and other conversations, and treats wildcards as text", async () => {
    const me = await trainee();
    const other = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const otherId = await ensureConversation(ds, other.id);
    const [kept, gone] = await seedText(conversationId, [
      "giảm 50% mỡ",
      "giảm 50% đã thu hồi",
    ]);

    await ds
      .getRepository(ChatMessage)
      .update({ id: gone }, { deletedAt: clock.now() });
    await seedText(conversationId, ["giảm 50% sticker"], {
      stickerRef: "pack:fire",
      stickerUrl: "/stickers/fluent/fire.svg",
    });
    await seedText(otherId, ["giảm 50% của người khác"]);
    await seedText(conversationId, ["giảm 500 mỡ", "giam a_b"]);
    const percent = await search(me.token, "50%");
    const underscore = await search(me.token, "a_b");
    const backslash = await search(me.token, "a\\b");

    expect(
      percent.body.results.map((r: { messageId: number }) => r.messageId),
    ).toEqual([kept]);
    expect(underscore.body.results).toHaveLength(1);
    expect(backslash.body.results).toEqual([]);
  });

  it("matches across a line break and a double space", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const [id] = await seedText(conversationId, ["bữa sáng\nyến   mạch"]);
    const response = await search(me.token, "sáng yến mạch");

    expect(
      response.body.results.map((r: { messageId: number }) => r.messageId),
    ).toEqual([id]);
  });

  it("pages with a cursor, with no gaps or repeats, and none when exactly one page", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const ids = await seedText(
      conversationId,
      Array.from({ length: 45 }, (_, i) => `buổi tập số ${i}`),
    );
    const seen: number[] = [];
    let cursor: number | null = null;
    let pages = 0;

    do {
      const response = await search(
        me.token,
        "tap so",
        cursor === null ? "" : `&before=${cursor}`,
      );

      seen.push(
        ...response.body.results.map((r: { messageId: number }) => r.messageId),
      );
      cursor = response.body.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual([...ids].reverse());
    const exact = await trainee();
    const exactId = await ensureConversation(ds, exact.id);

    await seedText(
      exactId,
      Array.from({ length: 20 }, (_, i) => `đúng một trang ${i}`),
    );
    const one = await search(exact.token, "dung mot trang");

    expect(one.body.results).toHaveLength(20);
    expect(one.body.nextCursor).toBeNull();
  });

  it("scans past many non-matching messages", async () => {
    const me = await trainee();
    const conversationId = await ensureConversation(ds, me.id);
    const [needle] = await seedText(conversationId, ["kim châm đặc biệt"]);

    await seedText(
      conversationId,
      Array.from({ length: 350 }, (_, i) => `tin thường ${i}`),
    );
    const response = await search(me.token, "kim cham");

    expect(
      response.body.results.map((r: { messageId: number }) => r.messageId),
    ).toEqual([needle]);
  });

  it("is empty without a conversation and 400 for a short query or a bad cursor, 401 signed out", async () => {
    const me = await trainee();

    expect((await search(me.token, "tap luyen")).body).toEqual({
      results: [],
      nextCursor: null,
    });
    expect((await search(me.token, "a")).status).toBe(400);
    expect((await search(me.token, " a ")).status).toBe(400);
    expect((await search(me.token, "x".repeat(101))).status).toBe(400);
    expect((await search(me.token, "tap luyen", "&before=abc")).status).toBe(
      400,
    );
    expect(
      (
        await callWith(
          app,
          "get",
          "/v1/chat/conversations/me/search?q=tap",
          null,
        )
      ).status,
    ).toBe(401);
    expect(
      (await callWith(app, "get", "/v1/chat/conversations/me/search", me.token))
        .status,
    ).toBe(400);
  });

  it("serves a PT the matches of an accessible trainee and 404 otherwise", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const [id] = await seedText(conversationId, ["kế hoạch ăn uống"]);
    const get = (token: string, cid = conversationId) =>
      callWith(
        app,
        "get",
        `/v1/chat/conversations/${cid}/search?q=ke%20hoach`,
        token,
      );

    expect(
      (await get(pt.token)).body.results.map(
        (r: { messageId: number }) => r.messageId,
      ),
    ).toEqual([id]);
    expect((await get(other.token)).status).toBe(404);
    expect((await get(pt.token, 999999)).status).toBe(404);
    expect((await get(me.token)).status).toBe(403);
  });
});
