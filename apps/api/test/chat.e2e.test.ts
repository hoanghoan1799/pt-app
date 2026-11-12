import type { INestApplication } from "@nestjs/common";
import { CHAT_MESSAGES } from "@pt/contracts";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { ChatConversation } from "../src/database/entities/chat-conversation.entity.js";
import { ChatMessage } from "../src/database/entities/chat-message.entity.js";
import { ChatMessageEdit } from "../src/database/entities/chat-message-edit.entity.js";
import { ChatReaction } from "../src/database/entities/chat-reaction.entity.js";
import { ChatRead } from "../src/database/entities/chat-read.entity.js";
import { User } from "../src/database/entities/user.entity.js";
import { createTestApp } from "./support/app.js";
import {
  FakeClock,
  hideTrainee,
  MINUTE,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import {
  callWith,
  captureEvents,
  enableChat,
  ensureConversation,
  newKey,
} from "./support/chat.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

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

type Pt = Awaited<ReturnType<typeof admin>>;

const sendAs = (
  token: string,
  body: object,
  key: string | null = newKey(),
  path = "/v1/chat/conversations/me/messages",
) =>
  callWith(app, "post", path, token, {
    body,
    headers: key === null ? {} : { "Idempotency-Key": key },
  });

const ptSend = (pt: Pt, userId: number, body: object, key = newKey()) =>
  sendAs(pt.token, body, key, `/v1/chat/trainees/${userId}/messages`);

const thread = (token: string, query = "") =>
  callWith(app, "get", `/v1/chat/conversations/me/messages${query}`, token);

const adminThread = (pt: Pt, conversationId: number, query = "") =>
  callWith(
    app,
    "get",
    `/v1/chat/conversations/${conversationId}/messages${query}`,
    pt.token,
  );

const conversationOf = async (userId: number) =>
  ds.getRepository(ChatConversation).findOneByOrFail({ userId });

// Seeds n plain messages straight into the table, oldest first.
const seedMessages = async (
  conversationId: number,
  count: number,
  senderRole: "user" | "admin" = "user",
  senderAdminId: number | null = null,
) => {
  const ids: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const saved = await ds.getRepository(ChatMessage).save({
      conversationId,
      senderRole,
      senderAdminId,
      body: `seed ${index}`,
      clientId: `seed-${conversationId}-${senderRole}-${ids.length}-${newKey()}`,
      createdAt: new Date(clock.now().getTime() + index),
    });

    ids.push(saved.id);
  }
  const last = ids[ids.length - 1];

  await ds
    .getRepository(ChatConversation)
    .update({ id: conversationId }, { lastMessageId: last });
  return ids;
};

describe("sending (trainee)", () => {
  it("stores the message, creates the conversation and emits chat.message.sent", async () => {
    const me = await trainee();
    const key = newKey();
    const response = await sendAs(me.token, { body: "  Chào PT  " }, key);

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({
      senderRole: "user",
      senderAdminId: null,
      senderAdminName: null,
      body: "Chào PT",
      sticker: null,
      photo: null,
      clientId: key,
      replyTo: null,
      editedAt: null,
      deleted: false,
      reactions: [],
      post: null,
    });
    const conversation = await conversationOf(me.id);

    expect(conversation.lastMessageId).toBe(response.body.message.id);
    expect(conversation.lastMessageAt).toEqual(
      new Date(response.body.message.createdAt),
    );
    expect(events.named("chat.message.sent")).toEqual([
      {
        name: "chat.message.sent",
        payload: {
          conversationId: conversation.id,
          traineeUserId: me.id,
          messageId: response.body.message.id,
          clientId: key,
          senderRole: "user",
          senderAdminId: null,
          silent: false,
          body: "Chào PT",
          hasSticker: false,
          hasPhoto: false,
          replyToMessageId: null,
        },
      },
    ]);
  });

  it("answers a retried Idempotency-Key with the stored message and nothing new", async () => {
    const me = await trainee();
    const key = newKey();
    const first = await sendAs(me.token, { body: "một lần" }, key);

    events.clear();
    const second = await sendAs(me.token, { body: "một lần" }, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.message.id).toBe(first.body.message.id);
    expect(await ds.getRepository(ChatMessage).countBy({ clientId: key })).toBe(
      1,
    );
    expect(events.named("chat.message.sent")).toHaveLength(0);
  });

  it("stores one row when the same key arrives twice at once", async () => {
    const me = await trainee();
    const key = newKey();
    const [a, b] = await Promise.all([
      sendAs(me.token, { body: "đua" }, key),
      sendAs(me.token, { body: "đua" }, key),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.message.id).toBe(b.body.message.id);
    expect(await ds.getRepository(ChatMessage).countBy({ clientId: key })).toBe(
      1,
    );
    expect(events.named("chat.message.sent")).toHaveLength(1);
  });

  it("accepts the web's clientId in the body when there is no header", async () => {
    const me = await trainee();
    const clientId = crypto.randomUUID();
    const response = await sendAs(me.token, { body: "web", clientId }, null);

    expect(response.status).toBe(201);
    expect(response.body.message.clientId).toBe(clientId);
  });

  it("refuses a missing or malformed key before storing anything", async () => {
    const me = await trainee();

    for (const key of [null, "short", "has spaces in it ok", "x".repeat(65)]) {
      const response = await sendAs(me.token, { body: "không key" }, key);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("IDEMPOTENCY_KEY_INVALID");
    }
    expect(
      await ds.getRepository(ChatConversation).countBy({ userId: me.id }),
    ).toBe(0);
  });

  it("does not hand one person's message to another who reuses the key", async () => {
    const me = await trainee();
    const pt = await admin("super_admin");
    const key = newKey();

    await sendAs(me.token, { body: "của học viên" }, key);
    const clash = await ptSend(pt, me.id, { body: "của PT" }, key);

    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("validates the body: trimmed, not empty, not too long, text xor sticker", async () => {
    const me = await trainee();
    const bad = [
      {},
      { body: "   " },
      { body: "x".repeat(2001) },
      { body: "hi", sticker: { pack: "fluent", id: "fire" } },
      { sticker: { pack: "fluent", id: "no-such-sticker" } },
      { body: "hi", replyToMessageId: 0 },
      { body: "hi", clientId: "not-a-uuid" },
    ];

    for (const body of bad) {
      const response = await sendAs(me.token, body);

      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
    expect(await sendAs(me.token, { body: "x".repeat(2000) })).toMatchObject({
      status: 201,
    });
  });

  it("answers 401 without a session and 403 to the wrong role", async () => {
    const pt = await admin();
    const me = await trainee();

    expect((await sendAs("", { body: "hi" })).status).toBe(401);
    expect((await sendAs(pt.token, { body: "hi" })).status).toBe(403);
    expect(
      (
        await sendAs(
          me.token,
          { body: "hi" },
          newKey(),
          `/v1/chat/trainees/${me.id}/messages`,
        )
      ).status,
    ).toBe(403);
  });

  it("is refused while chat is locked, and nothing is stored", async () => {
    const locked = await trainee({ chat: false });
    const response = await sendAs(locked.token, { body: "hi" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "CHAT_LOCKED",
      message: CHAT_MESSAGES.CHAT_LOCKED,
    });
    expect(
      await ds.getRepository(ChatMessage).count({
        where: {
          senderRole: "user",
          body: "hi",
          conversation: { userId: locked.id },
        },
      }),
    ).toBe(0);
  });

  it("has no send limit (D13): 25 messages in a row are all stored", async () => {
    const me = await trainee();

    for (let index = 0; index < 25; index += 1) {
      expect((await sendAs(me.token, { body: `m${index}` })).status).toBe(201);
    }
    const conversation = await conversationOf(me.id);

    expect(
      await ds
        .getRepository(ChatMessage)
        .countBy({ conversationId: conversation.id }),
    ).toBe(25);
  });
});

describe("slash commands", () => {
  it("/imlang strips the command, stores the rest and marks it silent", async () => {
    const me = await trainee();
    const response = await sendAs(me.token, { body: "/imlang  ngủ ngon" });

    expect(response.status).toBe(201);
    expect(response.body.message.body).toBe("ngủ ngon");
    const stored = await ds
      .getRepository(ChatMessage)
      .findOneByOrFail({ id: response.body.message.id });

    expect(stored.silent).toBe(true);
    expect(events.named("chat.message.sent")[0].payload).toMatchObject({
      silent: true,
      body: "ngủ ngon",
    });
  });

  it("rejects /imlang alone and keeps an unknown command as plain text", async () => {
    const me = await trainee();

    expect((await sendAs(me.token, { body: "/imlang" })).status).toBe(400);
    const plain = await sendAs(me.token, { body: "/other tập" });

    expect(plain.body.message.body).toBe("/other tập");
    const stored = await ds
      .getRepository(ChatMessage)
      .findOneByOrFail({ id: plain.body.message.id });

    expect(stored.silent).toBeNull();
    expect(events.named("chat.message.sent")[0].payload.silent).toBe(false);
  });
});

describe("replies and stickers", () => {
  it("stores a reply to a message of the same conversation with a snippet", async () => {
    const me = await trainee();
    const long = "a".repeat(200);
    const target = await sendAs(me.token, { body: long });
    const reply = await sendAs(me.token, {
      body: "trả lời",
      replyToMessageId: target.body.message.id,
    });

    expect(reply.status).toBe(201);
    expect(reply.body.message.replyTo).toEqual({
      id: target.body.message.id,
      body: "a".repeat(120),
      isSticker: false,
      isPhoto: false,
      senderRole: "user",
      deleted: false,
    });
  });

  it("rejects an unknown reply target and one from another conversation", async () => {
    const me = await trainee();
    const other = await trainee();
    const foreign = await sendAs(other.token, { body: "của người khác" });

    expect(
      (await sendAs(me.token, { body: "x", replyToMessageId: 999999 })).status,
    ).toBe(400);
    const response = await sendAs(me.token, {
      body: "x",
      replyToMessageId: foreign.body.message.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("CHAT_INVALID_INPUT");
  });

  it("stores a bundled sticker with an empty body and the manifest URL", async () => {
    const me = await trainee();
    const response = await sendAs(me.token, {
      sticker: { pack: "fluent", id: "flexed-biceps" },
    });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({
      body: "",
      sticker: {
        kind: "pack",
        url: "/stickers/fluent/flexed-biceps.svg",
        alt: "Cơ bắp",
      },
    });
    expect(events.named("chat.message.sent")[0].payload).toMatchObject({
      hasSticker: true,
      silent: false,
    });
  });

  it("stores a GIPHY sticker only for a GIPHY media URL", async () => {
    const me = await trainee();
    const url = "https://media3.giphy.com/media/abc123XYZ/200w.gif";
    const ok = await sendAs(me.token, {
      sticker: { giphyId: "abc123XYZ", url },
    });

    expect(ok.body.message.sticker).toEqual({
      kind: "giphy",
      url,
      alt: "Sticker GIPHY",
    });
    for (const bad of [
      "https://evil.example.com/abc123XYZ.gif",
      "http://media.giphy.com/abc123XYZ.gif",
      "https://media.giphy.com.evil.com/abc123XYZ.gif",
      "https://media.giphy.com/other.gif",
    ]) {
      const response = await sendAs(me.token, {
        sticker: { giphyId: "abc123XYZ", url: bad },
      });

      expect(response.status, bad).toBe(400);
    }
  });

  it("lets a sender use only their own personal sticker", async () => {
    const me = await trainee();
    const other = await trainee();
    const pt = await admin("super_admin");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const created = await callWith(
      app,
      "post",
      "/v1/chat/stickers/custom",
      other.token,
      {
        body: {},
      },
    );

    expect(created.status).toBe(400);
    const stored = await ds.query(
      `INSERT INTO chat_custom_stickers (owner_kind, owner_id, mime, data, size, created_at)
       VALUES ('user', $1, 'image/png', $2, $3, now()) RETURNING id`,
      [other.id, png, png.length],
    );
    const stickerId = stored[0].id as number;

    expect(
      (await sendAs(me.token, { sticker: { customId: stickerId } })).status,
    ).toBe(400);
    expect(
      (
        await sendAs(
          pt.token,
          { sticker: { customId: stickerId } },
          newKey(),
          `/v1/chat/trainees/${me.id}/messages`,
        )
      ).status,
    ).toBe(400);
    const mine = await sendAs(other.token, {
      sticker: { customId: stickerId },
    });

    expect(mine.status).toBe(201);
    expect(mine.body.message.sticker).toEqual({
      kind: "custom",
      url: `/v1/chat/stickers/custom/${stickerId}`,
      alt: "Sticker của tôi",
    });
  });

  it("answers a reply to a post with 404 until Social provides the post rules", async () => {
    const me = await trainee();

    expect(
      (await sendAs(me.token, { body: "về bài viết", postId: 5 })).body.code,
    ).toBe("POST_NOT_FOUND");
  });
});

describe("sending (PT)", () => {
  it("creates the conversation on the first send and records the PT", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const response = await ptSend(pt, me.id, { body: "Chào em" });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({
      senderRole: "admin",
      senderAdminId: pt.id,
      senderAdminName: pt.username,
      body: "Chào em",
    });
    expect(events.named("chat.message.sent")[0].payload).toMatchObject({
      senderRole: "admin",
      senderAdminId: pt.id,
      traineeUserId: me.id,
    });
    // The trainee sees it in their own thread.
    const seen = await thread(me.token);

    expect(seen.body.messages.map((m: { body: string }) => m.body)).toEqual([
      "Chào em",
    ]);
  });

  it("follows the PT scope: own trainees, any trainee for a super admin, 404 otherwise", async () => {
    const pt1 = await admin("pt");
    const pt2 = await admin("pt");
    const boss = await admin("super_admin");
    const mine = await trainee({ ptAdminId: pt1.id });
    const unassigned = await trainee();

    expect((await ptSend(pt1, mine.id, { body: "ok" })).status).toBe(201);
    expect((await ptSend(pt2, mine.id, { body: "no" })).status).toBe(404);
    expect((await ptSend(pt1, unassigned.id, { body: "no" })).status).toBe(404);
    expect((await ptSend(boss, unassigned.id, { body: "ok" })).status).toBe(
      201,
    );
    expect((await ptSend(boss, 999999, { body: "no" })).status).toBe(404);
  });

  it("refuses a locked trainee (D6) and writes nothing", async () => {
    const pt = await admin("super_admin");
    const locked = await trainee({ chat: false });
    const response = await ptSend(pt, locked.id, { body: "hi" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CHAT_LOCKED");
    expect(
      await ds.getRepository(ChatConversation).countBy({ userId: locked.id }),
    ).toBe(0);
  });

  it("hides a trainee the PT hid until the passcode reveal", async () => {
    const pt = await admin("pt", "1234");
    const me = await trainee({ ptAdminId: pt.id });

    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });
    await hideTrainee(ds, pt.id, me.id);
    expect((await ptSend(pt, me.id, { body: "ẩn" })).status).toBe(404);

    const reveal = await callWith(
      app,
      "post",
      "/v1/admins/me/hidden-users/reveal",
      pt.token,
      { body: { passcode: "1234" } },
    );

    expect(reveal.body.revealed).toBe(true);
    expect((await ptSend(pt, me.id, { body: "đã mở" })).status).toBe(201);
  });
});

describe("reading a thread", () => {
  it("returns the latest page oldest first, then older pages by before with no gaps", async () => {
    const me = await trainee();

    await sendAs(me.token, { body: "mở đầu" });
    const conversation = await conversationOf(me.id);
    const ids = await seedMessages(conversation.id, 34);
    const all = [
      (
        await ds
          .getRepository(ChatMessage)
          .findOneByOrFail({ conversationId: conversation.id, body: "mở đầu" })
      ).id,
      ...ids,
    ];
    const latest = await thread(me.token);

    expect(latest.status).toBe(200);
    expect(latest.body.messages.map((m: { id: number }) => m.id)).toEqual(
      all.slice(-30),
    );
    expect(latest.body.hasMore).toBe(true);
    const older = await thread(me.token, `?before=${all[all.length - 30]}`);

    expect(older.body.messages.map((m: { id: number }) => m.id)).toEqual(
      all.slice(0, 5),
    );
    expect(older.body.hasMore).toBe(false);
  });

  it("returns newer messages by after, and stays stable when a message arrives between pages", async () => {
    const me = await trainee();
    const pt = await admin("super_admin");

    await sendAs(me.token, { body: "một" });
    const first = await thread(me.token);
    const cursor = first.body.messages[0].id;

    await ptSend(pt, me.id, { body: "hai" });
    const page = await thread(me.token, `?after=${cursor}`);
    const again = await thread(me.token, `?after=${cursor}`);

    expect(page.body.messages.map((m: { body: string }) => m.body)).toEqual([
      "hai",
    ]);
    expect(again.body.messages).toEqual(page.body.messages);
  });

  it("answers 400 for after together with before, and for a bad cursor", async () => {
    const me = await trainee();

    expect((await thread(me.token, "?after=1&before=2")).status).toBe(400);
    expect((await thread(me.token, "?after=abc")).status).toBe(400);
    expect((await thread(me.token, "?before=0")).status).toBe(400);
  });

  it("returns an empty payload while chat is off and nothing was sent", async () => {
    const me = await trainee({ chat: false });
    const response = await thread(me.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      messages: [],
      hasMore: false,
      changes: [],
      lastChangeAt: 0,
      profile: { nicknames: {}, colors: {} },
      chatEnabled: false,
      peerReadUpTo: 0,
      peerLastSeenAt: null,
      conversationId: null,
      latestPt: null,
    });
    expect(
      await ds.getRepository(ChatConversation).countBy({ userId: me.id }),
    ).toBe(0);
  });

  it("creates the conversation on the first thread read when chat is on, once", async () => {
    const me = await trainee();

    expect(
      await ds.getRepository(ChatConversation).countBy({ userId: me.id }),
    ).toBe(0);
    const reads = await Promise.all([thread(me.token), thread(me.token)]);
    const conversation = await conversationOf(me.id);

    for (const read of reads) {
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({
        messages: [],
        chatEnabled: true,
        conversationId: conversation.id,
      });
    }
    expect(
      await ds.getRepository(ChatConversation).countBy({ userId: me.id }),
    ).toBe(1);
    // A later first message goes into the same conversation.
    await sendAs(me.token, { body: "chào" });
    expect((await conversationOf(me.id)).id).toBe(conversation.id);
  });

  it("names the conversation and the PT who wrote last", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });

    await sendAs(me.token, { body: "chào PT" });
    const conversation = await conversationOf(me.id);
    const before = await thread(me.token);

    expect(before.body.conversationId).toBe(conversation.id);
    expect(before.body.latestPt).toBeNull();
    await ptSend(pt, me.id, { body: "chào bạn" });
    expect((await thread(me.token)).body.latestPt).toEqual({
      id: pt.id,
      name: pt.username,
    });
  });

  it("still reads while chat is locked (D5) and reports chatEnabled false", async () => {
    const me = await trainee();

    await sendAs(me.token, { body: "trước khi khoá" });
    await enableChat(ds, me.id, false);
    const response = await thread(me.token);

    expect(response.status).toBe(200);
    expect(response.body.chatEnabled).toBe(false);
    expect(response.body.messages).toHaveLength(1);
  });

  it("jumps to a message: the page ending at it plus every newer message", async () => {
    const me = await trainee();

    await sendAs(me.token, { body: "seed" });
    const conversation = await conversationOf(me.id);
    const ids = await seedMessages(conversation.id, 60);
    const target = ids[10];
    const response = await thread(me.token, `?around=${target}`);
    const returned = response.body.messages.map((m: { id: number }) => m.id);

    expect(returned[returned.length - 1]).toBe(ids[ids.length - 1]);
    expect(returned).toContain(target);
    expect(returned.filter((id: number) => id <= target)).toHaveLength(11 + 1);
    expect((await thread(me.token, "?around=999999")).status).toBe(404);
  });

  it("shows the PT team's last seen to the trainee, honouring the presence switch", async () => {
    const pt = await admin("pt");
    const hidden = await admin("pt");
    const me = await trainee();

    await ds.query(`UPDATE admins SET last_seen_at = $1 WHERE id = $2`, [
      new Date("2026-11-12T09:00:00Z"),
      pt.id,
    ]);
    await ds.query(
      `UPDATE admins SET last_seen_at = $1, presence_hidden = true WHERE id = $2`,
      [new Date("2026-11-12T09:59:00Z"), hidden.id],
    );
    await sendAs(me.token, { body: "hi" });
    const response = await thread(me.token);

    expect(response.body.peerLastSeenAt).toBe("2026-11-12T09:00:00.000Z");
  });
});

describe("polling (204 vs changes)", () => {
  const known = (
    last: number,
    readUpTo: number,
    enabled: 0 | 1,
    changedSince?: number,
  ) =>
    `?after=${last}&readUpTo=${readUpTo}&enabled=${enabled}${
      changedSince === undefined ? "" : `&changedSince=${changedSince}`
    }`;

  it("answers 204 only when everything the client holds is current", async () => {
    const me = await trainee();
    const pt = await admin("super_admin");
    const sent = await sendAs(me.token, { body: "một" });
    const last = sent.body.message.id;

    expect((await thread(me.token, known(last, 0, 1))).status).toBe(204);
    expect((await thread(me.token, known(last, 0, 1, 0))).status).toBe(204);

    // A new message from the PT.
    const reply = await ptSend(pt, me.id, { body: "hai" });
    const news = await thread(me.token, known(last, 0, 1));

    expect(news.status).toBe(200);
    expect(news.body.messages.map((m: { id: number }) => m.id)).toEqual([
      reply.body.message.id,
    ]);
    expect(
      (await thread(me.token, known(reply.body.message.id, 0, 1))).status,
    ).toBe(204);

    // The lock state changed.
    await enableChat(ds, me.id, false);
    const locked = await thread(me.token, known(reply.body.message.id, 0, 1));

    expect(locked.status).toBe(200);
    expect(locked.body.chatEnabled).toBe(false);
    await enableChat(ds, me.id, true);

    // The PT read more ("Đã xem").
    const conversation = await conversationOf(me.id);

    await callWith(
      app,
      "post",
      `/v1/chat/conversations/${conversation.id}/read`,
      pt.token,
      {
        body: { lastReadMessageId: reply.body.message.id },
      },
    );
    const read = await thread(me.token, known(reply.body.message.id, 0, 1));

    expect(read.status).toBe(200);
    expect(read.body.peerReadUpTo).toBe(reply.body.message.id);
    expect(
      (
        await thread(
          me.token,
          known(reply.body.message.id, reply.body.message.id, 1),
        )
      ).status,
    ).toBe(204);
  });

  it("keeps a 200 for a client that does not send every known value", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "một" });
    const last = sent.body.message.id;

    for (const query of [
      `?after=${last}`,
      `?after=${last}&readUpTo=0`,
      `?after=${last}&enabled=1`,
      `?after=${last}&readUpTo=x&enabled=1`,
    ]) {
      const response = await thread(me.token, query);

      expect(response.status === 400 || response.status === 200, query).toBe(
        true,
      );
      expect(response.status).not.toBe(204);
    }
  });

  it("reports edited, unsent and reacted messages after changedSince and defeats the 204", async () => {
    const me = await trainee();
    const pt = await admin("super_admin");
    const a = await sendAs(me.token, { body: "a" });
    const b = await sendAs(me.token, { body: "b" });
    const start = await thread(me.token);

    expect(start.body.lastChangeAt).toBe(0);
    const since = start.body.lastChangeAt;
    const last = b.body.message.id;

    await callWith(
      app,
      "patch",
      `/v1/chat/messages/${a.body.message.id}`,
      me.token,
      {
        body: { body: "a sửa" },
      },
    );
    const afterEdit = await thread(me.token, known(last, 0, 1, since));

    expect(afterEdit.status).toBe(200);
    expect(afterEdit.body.changes.map((m: { id: number }) => m.id)).toEqual([
      a.body.message.id,
    ]);
    expect(afterEdit.body.lastChangeAt).toBeGreaterThan(since);
    const cursor = afterEdit.body.lastChangeAt;

    expect((await thread(me.token, known(last, 0, 1, cursor))).status).toBe(
      204,
    );

    await callWith(
      app,
      "put",
      `/v1/chat/messages/${b.body.message.id}/reaction`,
      pt.token,
      {
        body: { emoji: "💪" },
      },
    );
    const afterReact = await thread(me.token, known(last, 0, 1, cursor));

    expect(afterReact.status).toBe(200);
    expect(afterReact.body.changes).toHaveLength(1);
    expect(afterReact.body.changes[0]).toMatchObject({
      id: b.body.message.id,
      reactions: [
        { emoji: "💪", reactorKey: `admin:${pt.id}`, reactorName: pt.username },
      ],
    });
    // Without changedSince nothing is queried, but the cursor is reported.
    const plain = await thread(me.token);

    expect(plain.body.changes).toEqual([]);
    expect(plain.body.lastChangeAt).toBe(afterReact.body.lastChangeAt);
  });

  it("makes the change cursor strictly increase even inside one millisecond", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "một" });
    const cursors: number[] = [];

    for (const emoji of ["❤️", "😂", "😮"]) {
      await callWith(
        app,
        "put",
        `/v1/chat/messages/${sent.body.message.id}/reaction`,
        me.token,
        {
          body: { emoji },
        },
      );
      cursors.push((await thread(me.token)).body.lastChangeAt);
    }
    expect(cursors[1]).toBeGreaterThan(cursors[0]);
    expect(cursors[2]).toBeGreaterThan(cursors[1]);
  });

  it("pages through more than 200 changes without losing any", async () => {
    const me = await trainee();

    await sendAs(me.token, { body: "seed" });
    const conversation = await conversationOf(me.id);
    const ids = await seedMessages(conversation.id, 205);
    const base = new Date("2026-11-12T12:00:00.000Z").getTime();

    for (const [index, id] of ids.entries()) {
      await ds
        .getRepository(ChatMessage)
        .update({ id }, { updatedAt: new Date(base + index * 1000) });
    }
    await ds
      .getRepository(ChatConversation)
      .update(
        { id: conversation.id },
        { lastChangeAt: new Date(base + 205 * 1000) },
      );
    const seen = new Set<number>();
    let since = base - 1;

    for (let page = 0; page < 5; page += 1) {
      const response = await thread(me.token, `?changedSince=${since}`);
      const changes = response.body.changes as { id: number }[];

      if (changes.length === 0) {
        break;
      }
      expect(changes.length).toBeLessThanOrEqual(200);
      changes.forEach((change) => seen.add(change.id));
      if (response.body.lastChangeAt === since) {
        break;
      }
      since = response.body.lastChangeAt;
    }
    expect([...seen].sort((x, y) => x - y)).toEqual(ids);
  });
});

describe("edit and unsend", () => {
  it("edits the sender's own message, keeps the previous bodies and emits chat.message.edited", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "một" });
    const id = sent.body.message.id;

    events.clear();
    const first = await callWith(
      app,
      "patch",
      `/v1/chat/messages/${id}`,
      me.token,
      {
        body: { body: "  hai  " },
      },
    );
    const second = await callWith(
      app,
      "patch",
      `/v1/chat/messages/${id}`,
      me.token,
      {
        body: { body: "ba" },
      },
    );

    expect(first.status).toBe(200);
    expect(first.body.message).toMatchObject({ id, body: "hai" });
    expect(first.body.message.editedAt).not.toBeNull();
    expect(second.body.message.body).toBe("ba");
    const history = await callWith(
      app,
      "get",
      `/v1/chat/messages/${id}/edits`,
      me.token,
    );

    expect(
      history.body.edits.map((e: { previousBody: string }) => e.previousBody),
    ).toEqual(["một", "hai"]);
    const conversation = await conversationOf(me.id);
    const emitted = events.named("chat.message.edited");

    expect(emitted).toHaveLength(2);
    expect(emitted[1].payload).toEqual({
      conversationId: conversation.id,
      traineeUserId: me.id,
      messageId: id,
      changedAt: conversation.lastChangeAt?.getTime(),
    });
  });

  it("treats saving the same text as a no-op: no history, no marker, no event", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "giữ nguyên" });
    const id = sent.body.message.id;

    events.clear();
    const response = await callWith(
      app,
      "patch",
      `/v1/chat/messages/${id}`,
      me.token,
      {
        body: { body: "giữ nguyên" },
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.message.editedAt).toBeNull();
    expect(
      await ds.getRepository(ChatMessageEdit).countBy({ messageId: id }),
    ).toBe(0);
    expect(events.named("chat.message.edited")).toHaveLength(0);
  });

  it("lets both sides read the history and refuses edits on other people's messages", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const mine = await sendAs(me.token, { body: "của tôi" });
    const theirs = await ptSend(pt, me.id, { body: "của PT" });

    const edit = (token: string, id: number) =>
      callWith(app, "patch", `/v1/chat/messages/${id}`, token, {
        body: { body: "đổi" },
      });

    // trainee on PT message, PT on trainee message, a second PT on the first's.
    expect((await edit(me.token, theirs.body.message.id)).status).toBe(403);
    expect((await edit(me.token, theirs.body.message.id)).body.code).toBe(
      "NOT_YOUR_MESSAGE",
    );
    expect((await edit(pt.token, mine.body.message.id)).status).toBe(403);
    // The other PT cannot even see the conversation: the message is "not found".
    expect((await edit(other.token, theirs.body.message.id)).status).toBe(404);
    expect((await edit(pt.token, theirs.body.message.id)).status).toBe(200);
    const history = await callWith(
      app,
      "get",
      `/v1/chat/messages/${theirs.body.message.id}/edits`,
      me.token,
    );

    expect(history.status).toBe(200);
    expect(history.body.edits).toHaveLength(1);
  });

  it("refuses editing a sticker or an unsent message, and validates the body", async () => {
    const me = await trainee();
    const sticker = await sendAs(me.token, {
      sticker: { pack: "fluent", id: "fire" },
    });
    const text = await sendAs(me.token, { body: "sẽ thu hồi" });

    await callWith(
      app,
      "delete",
      `/v1/chat/messages/${text.body.message.id}`,
      me.token,
    );
    const edit = (id: number, body: string) =>
      callWith(app, "patch", `/v1/chat/messages/${id}`, me.token, {
        body: { body },
      });

    expect((await edit(sticker.body.message.id, "x")).body.code).toBe(
      "STICKER_NOT_EDITABLE",
    );
    expect((await edit(text.body.message.id, "x")).body.code).toBe(
      "MESSAGE_UNSENT",
    );
    expect((await edit(text.body.message.id, "  ")).status).toBe(400);
    expect((await edit(text.body.message.id, "x".repeat(2001))).status).toBe(
      400,
    );
  });

  it("unsends for everyone, empties the payload, is idempotent and emits once", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "thu hồi tôi" });
    const id = sent.body.message.id;

    await callWith(app, "put", `/v1/chat/messages/${id}/reaction`, me.token, {
      body: { emoji: "👍" },
    });
    events.clear();
    const first = await callWith(
      app,
      "delete",
      `/v1/chat/messages/${id}`,
      me.token,
    );
    const second = await callWith(
      app,
      "delete",
      `/v1/chat/messages/${id}`,
      me.token,
    );

    expect(first.status).toBe(200);
    expect(first.body.message).toMatchObject({
      id,
      body: "",
      deleted: true,
      sticker: null,
      photo: null,
      reactions: [],
    });
    expect(second.body.message.deleted).toBe(true);
    expect(events.named("chat.message.deleted")).toHaveLength(1);
    const history = await callWith(
      app,
      "get",
      `/v1/chat/messages/${id}/edits`,
      me.token,
    );

    expect(history.body.edits).toEqual([]);
    // The thread keeps the row but redacts it.
    const seen = await thread(me.token);

    expect(seen.body.messages[0]).toMatchObject({
      id,
      body: "",
      deleted: true,
    });
  });

  it("refuses unsending someone else's message and a message in a foreign conversation", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const stranger = await trainee();
    const theirs = await ptSend(pt, me.id, { body: "của PT" });

    expect(
      (
        await callWith(
          app,
          "delete",
          `/v1/chat/messages/${theirs.body.message.id}`,
          me.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await callWith(
          app,
          "delete",
          `/v1/chat/messages/${theirs.body.message.id}`,
          stranger.token,
        )
      ).status,
    ).toBe(404);
    expect(
      (await callWith(app, "delete", "/v1/chat/messages/999999", me.token))
        .status,
    ).toBe(404);
    expect(
      (await callWith(app, "delete", "/v1/chat/messages/abc", me.token)).status,
    ).toBe(400);
    expect(
      (
        await callWith(
          app,
          "delete",
          `/v1/chat/messages/${theirs.body.message.id}`,
          null,
        )
      ).status,
    ).toBe(401);
  });

  it("is blocked while chat is locked", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "trước khoá" });

    await enableChat(ds, me.id, false);
    const response = await callWith(
      app,
      "patch",
      `/v1/chat/messages/${sent.body.message.id}`,
      me.token,
      {
        body: { body: "sau khoá" },
      },
    );

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CHAT_LOCKED");
  });
});

describe("reactions", () => {
  const react = (token: string, id: number, emoji: string) =>
    callWith(app, "put", `/v1/chat/messages/${id}/reaction`, token, {
      body: { emoji },
    });

  it("adds, replaces and removes one reaction per reactor and emits chat.reaction.changed", async () => {
    const pt = await admin("super_admin");
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "phản ứng" });
    const id = sent.body.message.id;
    const conversation = await conversationOf(me.id);

    events.clear();
    const added = await react(me.token, id, "❤️");

    clock.advance(1000);
    const replaced = await react(me.token, id, "😂");

    clock.advance(1000);
    const byPt = await react(pt.token, id, "💪");

    expect(added.body.message.reactions).toEqual([
      { emoji: "❤️", reactorKey: "user", reactorName: me.name },
    ]);
    expect(replaced.body.message.reactions).toEqual([
      { emoji: "😂", reactorKey: "user", reactorName: me.name },
    ]);
    expect(byPt.body.message.reactions).toEqual([
      { emoji: "😂", reactorKey: "user", reactorName: me.name },
      { emoji: "💪", reactorKey: `admin:${pt.id}`, reactorName: pt.username },
    ]);
    const emitted = events.named("chat.reaction.changed");

    expect(emitted).toHaveLength(3);
    expect(emitted[1].payload).toMatchObject({
      conversationId: conversation.id,
      traineeUserId: me.id,
      messageId: id,
      reactorKey: "user",
      reactorName: me.name,
      emoji: "😂",
      previousEmoji: "❤️",
      authorRole: "user",
      authorAdminId: null,
    });
    // The same emoji again removes it; so does DELETE.
    const toggled = await react(me.token, id, "😂");

    expect(toggled.body.message.reactions).toHaveLength(1);
    const cleared = await callWith(
      app,
      "delete",
      `/v1/chat/messages/${id}/reaction`,
      pt.token,
    );

    expect(cleared.body.message.reactions).toEqual([]);
    expect(
      await ds.getRepository(ChatReaction).countBy({ messageId: id }),
    ).toBe(0);
    expect(events.named("chat.reaction.changed").at(-1)?.payload).toMatchObject(
      {
        reactorKey: `admin:${pt.id}`,
        emoji: null,
        previousEmoji: "💪",
      },
    );
  });

  it("does nothing, and emits nothing, when removing a reaction that does not exist", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "không có" });

    events.clear();
    const response = await callWith(
      app,
      "delete",
      `/v1/chat/messages/${sent.body.message.id}/reaction`,
      me.token,
    );

    expect(response.status).toBe(200);
    expect(response.body.message.reactions).toEqual([]);
    expect(events.named("chat.reaction.changed")).toHaveLength(0);
  });

  it("rejects an emoji outside the six and a reaction to an unsent message", async () => {
    const me = await trainee();
    const sent = await sendAs(me.token, { body: "emoji" });
    const id = sent.body.message.id;

    expect((await react(me.token, id, "🔥")).status).toBe(400);
    expect((await react(me.token, id, "")).status).toBe(400);
    expect(
      await ds.getRepository(ChatReaction).countBy({ messageId: id }),
    ).toBe(0);
    await callWith(app, "delete", `/v1/chat/messages/${id}`, me.token);
    const response = await react(me.token, id, "👍");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("MESSAGE_UNSENT");
  });

  it("answers not found for a message of another conversation, and is blocked while locked", async () => {
    const me = await trainee();
    const other = await trainee();
    const sent = await sendAs(other.token, { body: "của người khác" });

    expect((await react(me.token, sent.body.message.id, "👍")).status).toBe(
      404,
    );
    await enableChat(ds, other.id, false);
    expect(
      (await react(other.token, sent.body.message.id, "👍")).body.code,
    ).toBe("CHAT_LOCKED");
  });

  it("never lets a PT outside the workspace react", async () => {
    const pt = await admin("pt");
    const outsider = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const sent = await sendAs(me.token, { body: "riêng tư" });

    expect(
      (await react(outsider.token, sent.body.message.id, "👍")).status,
    ).toBe(404);
    expect((await react(pt.token, sent.body.message.id, "👍")).status).toBe(
      200,
    );
  });
});

describe("reads and unread counts", () => {
  it("moves the cursor forward only, clamps it to the last message and emits chat.read", async () => {
    const me = await trainee();
    const pt = await admin("super_admin");
    const a = await ptSend(pt, me.id, { body: "một" });
    const b = await ptSend(pt, me.id, { body: "hai" });
    const conversation = await conversationOf(me.id);
    const read = (lastReadMessageId: number) =>
      callWith(app, "post", "/v1/chat/conversations/me/read", me.token, {
        body: { lastReadMessageId },
      });

    events.clear();
    expect((await read(a.body.message.id)).body).toEqual({
      lastReadMessageId: a.body.message.id,
    });
    expect((await read(0)).body.lastReadMessageId).toBe(a.body.message.id);
    expect((await read(9999999)).body.lastReadMessageId).toBe(
      b.body.message.id,
    );
    expect((await read(a.body.message.id)).body.lastReadMessageId).toBe(
      b.body.message.id,
    );
    expect(events.named("chat.read")[0].payload).toEqual({
      conversationId: conversation.id,
      traineeUserId: me.id,
      readerKey: "user",
      lastReadMessageId: a.body.message.id,
    });
    expect(
      (
        await callWith(
          app,
          "post",
          "/v1/chat/conversations/me/read",
          me.token,
          { body: { lastReadMessageId: -1 } },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await callWith(
          app,
          "post",
          "/v1/chat/conversations/me/read",
          me.token,
          { body: { lastReadMessageId: "x" } },
        )
      ).status,
    ).toBe(400);
  });

  it("is a no-op success without a conversation and works while locked (D5)", async () => {
    const me = await trainee();
    const none = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/read",
      me.token,
      {
        body: { lastReadMessageId: 5 },
      },
    );

    expect(none.status).toBe(200);
    expect(none.body).toEqual({ lastReadMessageId: 0 });
    const pt = await admin("super_admin");
    const sent = await ptSend(pt, me.id, { body: "đọc đi" });

    await enableChat(ds, me.id, false);
    const locked = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/read",
      me.token,
      {
        body: { lastReadMessageId: sent.body.message.id },
      },
    );

    expect(locked.body.lastReadMessageId).toBe(sent.body.message.id);
  });

  it("counts unread per reader: a trainee, and each PT on their own", async () => {
    const pt1 = await admin("super_admin");
    const pt2 = await admin("super_admin");
    const me = await trainee();
    const unreadOf = async (token: string) =>
      (await callWith(app, "get", "/v1/chat/unread", token)).body;
    const base1 = (await unreadOf(pt1.token)).count;
    const base2 = (await unreadOf(pt2.token)).count;

    await sendAs(me.token, { body: "một" });
    await sendAs(me.token, { body: "hai" });
    await ptSend(pt1, me.id, { body: "trả lời" });
    const conversation = await conversationOf(me.id);

    expect(await unreadOf(me.token)).toEqual({
      count: 1,
      coachCount: 1,
      dmCount: 0,
      chatEnabled: true,
      hasHistory: true,
      latestLoudIncomingId: expect.any(Number),
    });
    const before = await unreadOf(pt1.token);

    expect(before.count).toBe(base1 + 2);
    expect(
      before.perTrainee.find((row: { userId: number }) => row.userId === me.id),
    ).toEqual({
      userId: me.id,
      conversationId: conversation.id,
      unread: 2,
      latestLoudIncomingId: expect.any(Number),
    });
    // pt1 reading does not clear pt2.
    await callWith(
      app,
      "post",
      `/v1/chat/conversations/${conversation.id}/read`,
      pt1.token,
      {
        body: { lastReadMessageId: 9999999 },
      },
    );
    expect((await unreadOf(pt1.token)).count).toBe(base1);
    expect((await unreadOf(pt2.token)).count).toBe(base2 + 2);
    expect(
      await ds
        .getRepository(ChatRead)
        .countBy({ conversationId: conversation.id }),
    ).toBe(1);
    // The trainee reading clears theirs.
    await callWith(app, "post", "/v1/chat/conversations/me/read", me.token, {
      body: { lastReadMessageId: 9999999 },
    });
    expect((await unreadOf(me.token)).count).toBe(0);
  });

  it("counts a silent /imlang message but does not report it as loud", async () => {
    const pt = await admin("super_admin");
    const me = await trainee();
    const loud = await ptSend(pt, me.id, { body: "to" });

    await ptSend(pt, me.id, { body: "/imlang nhỏ thôi" });
    const unread = (await callWith(app, "get", "/v1/chat/unread", me.token))
      .body;

    expect(unread.coachCount).toBe(2);
    expect(unread.latestLoudIncomingId).toBe(loud.body.message.id);
  });

  it("hides out-of-workspace and hidden trainees from a PT's badge", async () => {
    const pt = await admin("pt", "1234");
    const other = await admin("pt");
    const mine = await trainee({ ptAdminId: pt.id });
    const theirs = await trainee({ ptAdminId: other.id });
    const hidden = await trainee({ ptAdminId: pt.id });

    await sendAs(mine.token, { body: "của tôi" });
    await sendAs(theirs.token, { body: "của người khác" });
    await sendAs(hidden.token, { body: "ẩn" });
    await hideTrainee(ds, pt.id, hidden.id);
    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });
    const unread = (await callWith(app, "get", "/v1/chat/unread", pt.token))
      .body;

    expect(unread.count).toBe(1);
    expect(
      unread.perTrainee.map((row: { userId: number }) => row.userId),
    ).toEqual([mine.id]);
  });

  it("answers 401 without a session", async () => {
    expect((await callWith(app, "get", "/v1/chat/unread", null)).status).toBe(
      401,
    );
  });
});

describe("inbox", () => {
  it("lists my trainees newest first with unread, previews and trainees with no message yet", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const a = await trainee({ ptAdminId: pt.id });
    const b = await trainee({ ptAdminId: pt.id });
    const fresh = await trainee({ ptAdminId: pt.id });
    const foreign = await trainee({ ptAdminId: other.id });

    await sendAs(a.token, { body: "a cũ" });
    clock.advance(MINUTE);
    await sendAs(b.token, { sticker: { pack: "fluent", id: "fire" } });
    await sendAs(foreign.token, { body: "ngoài" });
    const response = await callWith(app, "get", "/v1/chat/inbox", pt.token);

    expect(response.status).toBe(200);
    expect(
      response.body.conversations.map((row: { userId: number }) => row.userId),
    ).toEqual([b.id, a.id]);
    expect(response.body.conversations[0]).toMatchObject({
      userName: b.name,
      displayName: b.name,
      chatEnabled: true,
      preview: "đã gửi một sticker",
      lastFromAdmin: false,
      unread: 1,
      avatarUrl: null,
    });
    expect(response.body.conversations[1]).toMatchObject({
      preview: "a cũ",
      unread: 1,
    });
    await ds.query(`UPDATE admins SET locale = 'en' WHERE id = $1`, [pt.id]);
    const english = await callWith(app, "get", "/v1/chat/inbox", pt.token);

    expect(english.body.conversations[0].preview).toBe("sent a sticker");
    expect(
      response.body.withoutConversation.map(
        (row: { userId: number }) => row.userId,
      ),
    ).toEqual([fresh.id]);
  });

  it("applies my private nickname and shows an unsent last message empty", async () => {
    const pt = await admin("pt");
    const a = await trainee({ ptAdminId: pt.id });
    const sent = await sendAs(a.token, { body: "sẽ thu hồi" });

    await callWith(app, "put", `/v1/contact-aliases/user:${a.id}`, pt.token, {
      body: { alias: "Bạn Mai" },
    });
    await callWith(
      app,
      "delete",
      `/v1/chat/messages/${sent.body.message.id}`,
      a.token,
    );
    const row = (await callWith(app, "get", "/v1/chat/inbox", pt.token)).body
      .conversations[0];

    expect(row).toMatchObject({
      displayName: "Bạn Mai",
      userName: a.name,
      preview: "",
    });
  });

  it("lists hidden trainees only for a session that revealed them", async () => {
    const pt = await admin("pt", "1234");
    const hidden = await trainee({ ptAdminId: pt.id });

    await sendAs(hidden.token, { body: "ẩn" });
    await hideTrainee(ds, pt.id, hidden.id);
    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });

    const visible = await callWith(app, "get", "/v1/chat/inbox", pt.token);
    const closed = await callWith(
      app,
      "get",
      "/v1/chat/inbox?hidden=1",
      pt.token,
    );

    expect(visible.body.conversations).toEqual([]);
    expect(closed.body).toEqual({ conversations: [], withoutConversation: [] });
    await callWith(app, "post", "/v1/admins/me/hidden-users/reveal", pt.token, {
      body: { passcode: "1234" },
    });
    const open = await callWith(
      app,
      "get",
      "/v1/chat/inbox?hidden=1",
      pt.token,
    );

    expect(
      open.body.conversations.map((row: { userId: number }) => row.userId),
    ).toEqual([hidden.id]);
  });

  it("is for admins only", async () => {
    const me = await trainee();

    expect(
      (await callWith(app, "get", "/v1/chat/inbox", me.token)).status,
    ).toBe(403);
    expect((await callWith(app, "get", "/v1/chat/inbox", null)).status).toBe(
      401,
    );
  });
});

describe("PT access to a conversation", () => {
  it("reads the thread of own trainees only, with 404 for the rest", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const boss = await admin("super_admin");
    const me = await trainee({ ptAdminId: pt.id });

    await sendAs(me.token, { body: "xin chào" });
    const conversation = await conversationOf(me.id);
    const mine = await adminThread(pt, conversation.id);

    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({
      userId: me.id,
      chatEnabled: true,
      peerReadUpTo: 0,
      peerLastSeenAt: null,
    });
    expect(mine.body.messages).toHaveLength(1);
    expect((await adminThread(other, conversation.id)).status).toBe(404);
    expect((await adminThread(boss, conversation.id)).status).toBe(200);
    expect((await adminThread(pt, 999999)).status).toBe(404);
    expect((await adminThread(pt, 0)).status).toBe(400);
    expect(
      (
        await callWith(
          app,
          "get",
          `/v1/chat/conversations/${conversation.id}/messages`,
          me.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await callWith(
          app,
          "get",
          `/v1/chat/conversations/${conversation.id}/messages`,
          null,
        )
      ).status,
    ).toBe(401);
  });

  it("never answers 204 to an admin and reports the trainee's cursor and last seen", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const sent = await sendAs(me.token, { body: "đã xem" });
    const conversation = await conversationOf(me.id);

    await callWith(app, "post", "/v1/chat/conversations/me/read", me.token, {
      body: { lastReadMessageId: sent.body.message.id },
    });
    await ds
      .getRepository(User)
      .update({ id: me.id }, { lastSeenAt: new Date("2026-11-12T08:00:00Z") });
    const response = await adminThread(
      pt,
      conversation.id,
      `?after=${sent.body.message.id}&readUpTo=${sent.body.message.id}&enabled=1`,
    );

    expect(response.status).toBe(200);
    expect(response.body.peerReadUpTo).toBe(sent.body.message.id);
    expect(response.body.peerLastSeenAt).toBe("2026-11-12T08:00:00.000Z");
  });

  it("hides the thread of a hidden trainee until the reveal", async () => {
    const pt = await admin("pt", "1234");
    const me = await trainee({ ptAdminId: pt.id });

    await sendAs(me.token, { body: "ẩn" });
    const conversation = await conversationOf(me.id);

    await hideTrainee(ds, pt.id, me.id);
    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });
    expect((await adminThread(pt, conversation.id)).status).toBe(404);
    await callWith(app, "post", "/v1/admins/me/hidden-users/reveal", pt.token, {
      body: { passcode: "1234" },
    });
    expect((await adminThread(pt, conversation.id)).status).toBe(200);
  });

  it("stops a passcode-locked admin everywhere", async () => {
    const pt = await admin("pt", "1234");
    const me = await trainee({ ptAdminId: pt.id });

    await sendAs(me.token, { body: "khoá" });
    const conversation = await conversationOf(me.id);
    const response = await adminThread(pt, conversation.id);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ADMIN_LOCKED");
  });

  it("serves the conversation header with my nickname and the chat switch", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const fresh = await trainee({ ptAdminId: pt.id });

    await sendAs(me.token, { body: "hi" });
    await callWith(app, "put", `/v1/contact-aliases/user:${me.id}`, pt.token, {
      body: { alias: "Mai" },
    });
    const conversation = await conversationOf(me.id);
    const header = await callWith(
      app,
      "get",
      `/v1/chat/conversations/${conversation.id}`,
      pt.token,
    );

    expect(header.body).toMatchObject({
      conversationId: conversation.id,
      userId: me.id,
      userName: me.name,
      displayName: "Mai",
      chatEnabled: true,
      profile: { nicknames: { user: "Mai" }, colors: {} },
    });
    const none = await callWith(
      app,
      "get",
      `/v1/chat/trainees/${fresh.id}/conversation`,
      pt.token,
    );

    // The admin's read creates the conversation of a trainee whose chat is on.
    expect(none.body).toMatchObject({
      conversationId: (await conversationOf(fresh.id)).id,
      userId: fresh.id,
    });
    const again = await callWith(
      app,
      "get",
      `/v1/chat/trainees/${fresh.id}/conversation`,
      pt.token,
    );

    expect(again.body.conversationId).toBe(none.body.conversationId);
    // Chat off and nothing sent: no conversation to open.
    const locked = await trainee({ ptAdminId: pt.id, chat: false });
    const closed = await callWith(
      app,
      "get",
      `/v1/chat/trainees/${locked.id}/conversation`,
      pt.token,
    );

    expect(closed.body).toMatchObject({
      conversationId: null,
      chatEnabled: false,
    });
  });

  it("switches chat for one trainee, emits chat.status.changed and respects the scope", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id, chat: false });
    const put = (token: string, enabled: unknown) =>
      callWith(app, "put", `/v1/chat/trainees/${me.id}/enabled`, token, {
        body: { enabled },
      });

    expect((await put(other.token, true)).status).toBe(404);
    expect((await put(pt.token, "yes")).status).toBe(400);
    expect((await put(me.token, true)).status).toBe(403);
    events.clear();
    const on = await put(pt.token, true);

    expect(on.body).toEqual({ enabled: true });
    const stored = await ds.getRepository(User).findOneByOrFail({ id: me.id });

    expect(stored.chatEnabled).toBe(true);
    expect(stored.chatEnabledByAdminId).toBe(pt.id);
    expect(stored.chatEnabledChangedAt).toEqual(clock.now());
    // Chat on creates the conversation with it, no first message needed.
    const created = await conversationOf(me.id);

    expect(events.named("chat.status.changed")[0].payload).toEqual({
      userId: me.id,
      conversationId: created.id,
      enabled: true,
    });
    // Switching it on again, or off and on, keeps that one conversation.
    await put(pt.token, true);
    await put(pt.token, false);
    await put(pt.token, true);
    expect((await conversationOf(me.id)).id).toBe(created.id);
    await put(pt.token, false);
    // Locked again: the trainee can no longer send.
    await put(pt.token, false);
    expect((await sendAs(me.token, { body: "hi" })).status).toBe(403);
  });
});

describe("conversation colour", () => {
  it("sets and clears my colour for one conversation and defeats the 204", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const sent = await sendAs(me.token, { body: "màu" });
    const conversation = await conversationOf(me.id);
    const color = (value: unknown) =>
      callWith(
        app,
        "put",
        `/v1/chat/conversations/${conversation.id}/color`,
        pt.token,
        { body: { color: value } },
      );

    await ds.query(`UPDATE admins SET chat_color = 'blue' WHERE id = $1`, [
      pt.id,
    ]);
    await ds.query(`UPDATE users SET chat_color = 'green' WHERE id = $1`, [
      me.id,
    ]);
    const before = await thread(me.token);

    events.clear();
    const set = await color("red");

    expect(set.status).toBe(200);
    expect(set.body.profile.colors).toEqual({
      user: "green",
      [`admin:${pt.id}`]: "red",
    });
    expect(events.named("chat.profile.changed")).toHaveLength(1);
    const seen = await thread(
      me.token,
      `?after=${sent.body.message.id}&readUpTo=0&enabled=1&changedSince=${before.body.lastChangeAt}`,
    );

    expect(seen.status).toBe(200);
    expect(seen.body.profile.colors[`admin:${pt.id}`]).toBe("red");
    const cleared = await color(null);

    expect(cleared.body.profile.colors[`admin:${pt.id}`]).toBe("blue");
    expect((await color("magenta")).status).toBe(400);
    expect((await color(undefined)).status).toBe(400);
  });

  it("is refused for an admin outside the workspace and while the chat is locked", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });

    await sendAs(me.token, { body: "màu" });
    const conversation = await conversationOf(me.id);
    const put = (token: string) =>
      callWith(
        app,
        "put",
        `/v1/chat/conversations/${conversation.id}/color`,
        token,
        { body: { color: "pink" } },
      );

    expect((await put(other.token)).status).toBe(404);
    await enableChat(ds, me.id, false);
    expect((await put(pt.token)).body.code).toBe("CHAT_LOCKED");
  });
});

describe("bubbles", () => {
  it("gives a trainee their coach chat and an admin the listed chats they may open", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const mine = await trainee({ ptAdminId: pt.id });
    const theirs = await trainee({ ptAdminId: other.id });
    const locked = await trainee({ ptAdminId: pt.id });

    await ds.query(`UPDATE admins SET last_seen_at = NULL`);
    await sendAs(mine.token, { body: "hi" });
    await sendAs(theirs.token, { body: "hi" });
    await ensureConversation(ds, locked.id);
    await enableChat(ds, locked.id, false);
    await ptSend(pt, mine.id, { body: "chào" });
    await callWith(app, "put", `/v1/contact-aliases/pt`, mine.token, {
      body: { alias: "Thầy Hoàn" },
    });

    const coach = await callWith(app, "get", "/v1/chat/bubbles", mine.token);

    expect(coach.body.bubbles).toEqual([
      {
        userId: mine.id,
        conversationId: (await conversationOf(mine.id)).id,
        name: "Thầy Hoàn",
        avatarUrl: null,
        lastSeenAt: null,
      },
    ]);
    const ids = [mine.id, theirs.id, locked.id, 999999, mine.id].join(",");
    const list = await callWith(
      app,
      "get",
      `/v1/chat/bubbles?ids=${ids}`,
      pt.token,
    );

    expect(list.body.bubbles.map((b: { userId: number }) => b.userId)).toEqual([
      mine.id,
    ]);
    await enableChat(ds, mine.id, false);
    expect(
      (await callWith(app, "get", "/v1/chat/bubbles", mine.token)).body.bubbles,
    ).toEqual([]);
    expect((await callWith(app, "get", "/v1/chat/bubbles", null)).status).toBe(
      401,
    );
  });
});

describe("GET /v1/chat/team", () => {
  it("lists the admins with a photo or the blue tick for a trainee and an admin", async () => {
    const pt = await admin("pt");
    const plain = await admin("pt");
    const ticked = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });

    await ds.query(`UPDATE admins SET avatar_updated_at = $1 WHERE id = $2`, [
      new Date("2026-11-01T00:00:00Z"),
      pt.id,
    ]);
    await ds.query(`UPDATE admins SET verified_at = $1 WHERE id = $2`, [
      clock.now(),
      ticked.id,
    ]);
    const expected = {
      admins: [
        {
          id: pt.id,
          avatarUrl: expect.stringMatching(
            /^\/v1\/avatars\/admin\/\d+\?v=\d+$/,
          ),
          verified: false,
        },
        { id: ticked.id, avatarUrl: null, verified: true },
      ],
    };

    for (const token of [me.token, pt.token]) {
      const response = await callWith(app, "get", "/v1/chat/team", token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(expected);
      expect(
        response.body.admins.some((row: { id: number }) => row.id === plain.id),
      ).toBe(false);
    }
    expect((await callWith(app, "get", "/v1/chat/team", null)).status).toBe(
      401,
    );
  });
});
