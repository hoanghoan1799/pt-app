import type { INestApplication } from "@nestjs/common";
import { DM_MESSAGES } from "@pt/contracts";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { DmConversation } from "../src/database/entities/dm-conversation.entity.js";
import { DmMessage } from "../src/database/entities/dm-message.entity.js";
import { DmPhoto } from "../src/database/entities/dm-photo.entity.js";
import { DmRead } from "../src/database/entities/dm-read.entity.js";
import { SocialBlock } from "../src/database/entities/social-block.entity.js";
import { User } from "../src/database/entities/user.entity.js";
import { createTestApp } from "./support/app.js";
import {
  FakeClock,
  MINUTE,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import {
  callWith,
  captureEvents,
  enableChat,
  pngBytes,
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

const trainee = async (options: { terms?: boolean; name?: string } = {}) => {
  const row = await seedUser(ds, { name: options.name });

  if (options.terms !== false) {
    await ds.getRepository(User).update({ id: row.id }, { termsVersion: 1 });
  }
  return { ...row, token: await tokenOf(app, { kind: "user", ...row }) };
};

const admin = async (role: "super_admin" | "pt" = "pt") => {
  const row = await seedAdmin(ds, { role });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

type Person = Awaited<ReturnType<typeof trainee>>;

// Old data: sending is disabled, so conversations are seeded directly.
const conversationBetween = async (a: Person, b: Person) => {
  const [low, high] = a.id < b.id ? [a, b] : [b, a];

  return (
    await ds.getRepository(DmConversation).save({
      userLow: low.id,
      userHigh: high.id,
      createdAt: clock.now(),
    })
  ).id;
};

let counter = 0;
const message = async (
  conversationId: number,
  sender: Person,
  body: string | null,
  extra: Partial<DmMessage> = {},
) => {
  counter += 1;
  clock.advance(1000);
  const saved = await ds.getRepository(DmMessage).save({
    conversationId,
    senderId: sender.id,
    body,
    clientId: `dm-client-${counter}`,
    createdAt: clock.now(),
    ...extra,
  });

  await ds
    .getRepository(DmConversation)
    .update(
      { id: conversationId },
      { lastMessageId: saved.id, lastMessageAt: saved.createdAt },
    );
  return saved.id;
};

const dmPhoto = async (
  conversationId: number,
  uploader: Person,
  messageId: number,
) => {
  const photo = await ds.getRepository(DmPhoto).save({
    conversationId,
    messageId,
    uploaderId: uploader.id,
    mime: "image/png",
    width: 40,
    height: 30,
    data: pngBytes(40, 30, 200),
    size: 200,
    createdAt: clock.now(),
  });

  await ds
    .getRepository(DmMessage)
    .update({ id: messageId }, { photoId: photo.id });
  return photo.id;
};

describe("GET /v1/dm/conversations", () => {
  it("lists my conversations that have a message, newest first, with unread and my nickname", async () => {
    const me = await trainee();
    const ann = await trainee({ name: "Ann" });
    const bob = await trainee({ name: "Bob" });
    const empty = await trainee();
    const strangers = [await trainee(), await trainee()];

    const withAnn = await conversationBetween(me, ann);
    const withBob = await conversationBetween(me, bob);

    await conversationBetween(me, empty);
    await conversationBetween(strangers[0], strangers[1]);
    await message(withAnn, ann, "chào bạn");
    await message(withAnn, me, "chào Ann");
    await message(withAnn, ann, "tập không?");
    clock.advance(MINUTE);
    const lastBob = await message(withBob, me, null);

    await dmPhoto(withBob, me, lastBob);
    await callWith(app, "put", `/v1/contact-aliases/user:${ann.id}`, me.token, {
      body: { alias: "Annie" },
    });
    const response = await callWith(
      app,
      "get",
      "/v1/dm/conversations",
      me.token,
    );

    expect(response.status).toBe(200);
    expect(response.body.conversations).toEqual([
      {
        conversationId: withBob,
        otherId: bob.id,
        name: "Bob",
        avatarUrl: null,
        preview: "Bạn: 📷 Ảnh",
        lastMessageAt: expect.any(String),
        unread: 0,
      },
      {
        conversationId: withAnn,
        otherId: ann.id,
        name: "Annie",
        avatarUrl: null,
        preview: "tập không?",
        lastMessageAt: expect.any(String),
        unread: 2,
      },
    ]);
  });

  it("leaves out a conversation with someone who blocked me or whom I blocked", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);

    await message(cid, ann, "xin chào");
    await ds
      .getRepository(SocialBlock)
      .save({ blockerId: ann.id, blockedId: me.id, createdAt: clock.now() });
    expect(
      (await callWith(app, "get", "/v1/dm/conversations", me.token)).body
        .conversations,
    ).toEqual([]);
    expect(
      (await callWith(app, "get", "/v1/chat/unread", me.token)).body.dmCount,
    ).toBe(0);
  });

  it("needs the accepted terms, a trainee session and a session at all", async () => {
    const noTerms = await trainee({ terms: false });
    const pt = await admin();

    const refused = await callWith(
      app,
      "get",
      "/v1/dm/conversations",
      noTerms.token,
    );

    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      code: "TERMS_REQUIRED",
      message: DM_MESSAGES.TERMS_REQUIRED,
    });
    expect(
      (await callWith(app, "get", "/v1/dm/conversations", pt.token)).status,
    ).toBe(403);
    expect(
      (await callWith(app, "get", "/v1/dm/conversations", null)).status,
    ).toBe(401);
  });
});

describe("GET /v1/dm/conversations/:cid/messages", () => {
  const thread = (token: string | null, cid: number, query = "") =>
    callWith(app, "get", `/v1/dm/conversations/${cid}/messages${query}`, token);

  it("returns the newest page oldest first, unsent ids and the other member's read mark", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);
    const first = await message(cid, ann, "một");
    const gone = await message(cid, ann, "hai");
    const photoMessage = await message(cid, me, "ảnh");
    const photoId = await dmPhoto(cid, me, photoMessage);

    await ds
      .getRepository(DmMessage)
      .update({ id: gone }, { deletedAt: clock.now(), body: null });
    await ds
      .getRepository(DmRead)
      .save({
        conversationId: cid,
        userId: ann.id,
        lastReadMessageId: photoMessage,
      });
    const response = await thread(me.token, cid);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      messages: [
        {
          id: first,
          senderId: ann.id,
          body: "một",
          photo: null,
          post: null,
          clientId: expect.any(String),
          createdAt: expect.any(String),
        },
        {
          id: photoMessage,
          senderId: me.id,
          body: "ảnh",
          photo: { url: `/v1/dm/photos/${photoId}`, width: 40, height: 30 },
          post: null,
          clientId: expect.any(String),
          createdAt: expect.any(String),
        },
      ],
      deletedIds: [gone],
      hasMore: false,
      otherReadUpTo: photoMessage,
      readOnlyReason: DM_MESSAGES.DISABLED,
      isReadOnly: true,
    });
  });

  it("pages with after and before, 50 at a time", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);
    const ids: number[] = [];

    for (let index = 0; index < 55; index += 1) {
      ids.push(await message(cid, index % 2 === 0 ? ann : me, `tin ${index}`));
    }
    const latest = await thread(me.token, cid);

    expect(latest.body.messages.map((m: { id: number }) => m.id)).toEqual(
      ids.slice(5),
    );
    expect(latest.body.hasMore).toBe(true);
    const older = await thread(me.token, cid, `?before=${ids[5]}`);

    expect(older.body.messages.map((m: { id: number }) => m.id)).toEqual(
      ids.slice(0, 5),
    );
    expect(older.body.hasMore).toBe(false);
    const newer = await thread(me.token, cid, `?after=${ids[50]}`);

    expect(newer.body.messages.map((m: { id: number }) => m.id)).toEqual(
      ids.slice(51),
    );
    expect((await thread(me.token, cid, "?after=1&before=2")).status).toBe(400);
    expect((await thread(me.token, cid, "?after=x")).status).toBe(400);
  });

  it("opens for the two members and a super admin (read-only), never for anyone else", async () => {
    const me = await trainee();
    const ann = await trainee();
    const stranger = await trainee();
    const boss = await admin("super_admin");
    const pt = await admin("pt");
    const cid = await conversationBetween(me, ann);

    await message(cid, me, "riêng");

    expect((await thread(ann.token, cid)).status).toBe(200);
    expect((await thread(me.token, cid)).status).toBe(200);
    const asBoss = await thread(boss.token, cid);

    expect(asBoss.status).toBe(200);
    expect(asBoss.body).toMatchObject({
      isReadOnly: true,
      readOnlyReason: null,
      otherReadUpTo: 0,
    });
    for (const token of [stranger.token, pt.token]) {
      expect((await thread(token, cid)).status).toBe(404);
    }
    expect((await thread(null, cid)).status).toBe(401);
    expect((await thread(me.token, 999999)).status).toBe(404);
    expect((await thread(me.token, 0)).status).toBe(400);
  });

  it("is hidden from the members by a block, and by missing terms", async () => {
    const me = await trainee();
    const ann = await trainee();
    const noTerms = await trainee({ terms: false });
    const cid = await conversationBetween(me, ann);
    const cid2 = await conversationBetween(noTerms, ann);

    expect((await thread(me.token, cid)).status).toBe(200);
    await ds
      .getRepository(SocialBlock)
      .save({ blockerId: me.id, blockedId: ann.id, createdAt: clock.now() });
    expect((await thread(me.token, cid)).status).toBe(404);
    expect((await thread(ann.token, cid)).status).toBe(404);
    expect((await thread(noTerms.token, cid2)).status).toBe(404);
  });
});

describe("sending is switched off", () => {
  const send = (
    token: string | null,
    cid: number,
    body: object = { body: "hi", clientId: "client-12345" },
  ) =>
    callWith(app, "post", `/v1/dm/conversations/${cid}/messages`, token, {
      body,
    });

  it("refuses a send from a member with 403 DM_DISABLED and stores nothing", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);
    const response = await send(me.token, cid);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "DM_DISABLED",
      message: DM_MESSAGES.DISABLED,
    });
    expect(
      await ds.getRepository(DmMessage).countBy({ conversationId: cid }),
    ).toBe(0);
    expect(events.all.filter((e) => e.name.startsWith("dm."))).toEqual([]);
  });

  it("answers 404 to a non-member, 400 to a malformed body, 401 and 403 by role", async () => {
    const me = await trainee();
    const ann = await trainee();
    const stranger = await trainee();
    const boss = await admin("super_admin");
    const cid = await conversationBetween(me, ann);

    expect((await send(stranger.token, cid)).status).toBe(404);
    expect((await send(me.token, 999999)).status).toBe(404);
    expect((await send(me.token, cid, { body: 5 })).status).toBe(400);
    expect((await send(null, cid)).status).toBe(401);
    expect((await send(boss.token, cid)).status).toBe(403);
  });

  it("opens an existing conversation but never creates one", async () => {
    const me = await trainee();
    const ann = await trainee();
    const bob = await trainee();
    const noTerms = await trainee({ terms: false });
    const cid = await conversationBetween(me, ann);
    const open = (token: string, otherId: number) =>
      callWith(app, "post", "/v1/dm/conversations", token, {
        body: { otherId },
      });

    expect((await open(me.token, ann.id)).body).toEqual({
      conversationId: cid,
    });
    expect((await open(ann.token, me.id)).body).toEqual({
      conversationId: cid,
    });
    const none = await open(me.token, bob.id);

    expect(none.status).toBe(403);
    expect(none.body.code).toBe("DM_DISABLED");
    expect(await ds.getRepository(DmConversation).count()).toBeGreaterThan(0);
    expect(
      await ds
        .getRepository(DmConversation)
        .countBy({
          userLow: Math.min(me.id, bob.id),
          userHigh: Math.max(me.id, bob.id),
        }),
    ).toBe(0);
    expect((await open(me.token, me.id)).status).toBe(404);
    expect((await open(noTerms.token, ann.id)).body.code).toBe(
      "TERMS_REQUIRED",
    );
    expect((await open(me.token, 0)).status).toBe(400);
    await ds
      .getRepository(SocialBlock)
      .save({ blockerId: ann.id, blockedId: me.id, createdAt: clock.now() });
    expect((await open(me.token, ann.id)).status).toBe(404);
  });
});

describe("read marks and unsend", () => {
  it("marks a conversation read, moves forward only, updates dmCount and emits dm.read", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);

    await message(cid, ann, "một");
    const last = await message(cid, ann, "hai");
    const unread = async () =>
      (await callWith(app, "get", "/v1/chat/unread", me.token)).body;

    expect((await unread()).dmCount).toBe(2);
    expect((await unread()).count).toBe(2);
    const read = await callWith(
      app,
      "post",
      `/v1/dm/conversations/${cid}/read`,
      me.token,
    );

    expect(read.status).toBe(200);
    expect(read.body).toEqual({ lastReadMessageId: last });
    expect((await unread()).dmCount).toBe(0);
    expect(events.named("dm.read")).toEqual([
      {
        name: "dm.read",
        payload: {
          conversationId: cid,
          userId: me.id,
          lastReadMessageId: last,
        },
      },
    ]);
    await ds
      .getRepository(DmRead)
      .update(
        { conversationId: cid, userId: me.id },
        { lastReadMessageId: last + 100 },
      );
    expect(
      (
        await callWith(
          app,
          "post",
          `/v1/dm/conversations/${cid}/read`,
          me.token,
        )
      ).body.lastReadMessageId,
    ).toBe(last + 100);
    // Not for the other side's thread or a non-member.
    const stranger = await trainee();

    expect(
      (
        await callWith(
          app,
          "post",
          `/v1/dm/conversations/${cid}/read`,
          stranger.token,
        )
      ).status,
    ).toBe(404);
    expect(
      (await callWith(app, "post", `/v1/dm/conversations/${cid}/read`, null))
        .status,
    ).toBe(401);
  });

  it("is a no-op without messages", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);
    const response = await callWith(
      app,
      "post",
      `/v1/dm/conversations/${cid}/read`,
      me.token,
    );

    expect(response.body).toEqual({ lastReadMessageId: 0 });
    expect(
      await ds.getRepository(DmRead).countBy({ conversationId: cid }),
    ).toBe(0);
  });

  it("lets a member take back their own message, photo bytes included, and emits dm.message.deleted", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);
    const mine = await message(cid, me, "thu hồi", {});
    const photoId = await dmPhoto(cid, me, mine);
    const theirs = await message(cid, ann, "của Ann");

    expect(
      (await callWith(app, "delete", `/v1/dm/messages/${theirs}`, me.token))
        .status,
    ).toBe(404);
    const done = await callWith(
      app,
      "delete",
      `/v1/dm/messages/${mine}`,
      me.token,
    );

    expect(done.status).toBe(204);
    const stored = await ds
      .getRepository(DmMessage)
      .findOneByOrFail({ id: mine });

    expect(stored).toMatchObject({
      body: null,
      photoId: null,
      replyPostId: null,
    });
    expect(stored.deletedAt).not.toBeNull();
    expect(await ds.getRepository(DmPhoto).existsBy({ id: photoId })).toBe(
      false,
    );
    expect(events.named("dm.message.deleted")).toEqual([
      {
        name: "dm.message.deleted",
        payload: { conversationId: cid, messageId: mine, senderId: me.id },
      },
    ]);
    // Already unsent, unknown, malformed and signed-out.
    expect(
      (await callWith(app, "delete", `/v1/dm/messages/${mine}`, me.token))
        .status,
    ).toBe(404);
    expect(
      (await callWith(app, "delete", "/v1/dm/messages/999999", me.token))
        .status,
    ).toBe(404);
    expect(
      (await callWith(app, "delete", "/v1/dm/messages/x", me.token)).status,
    ).toBe(400);
    expect(
      (await callWith(app, "delete", `/v1/dm/messages/${theirs}`, null)).status,
    ).toBe(401);
    const thread = await callWith(
      app,
      "get",
      `/v1/dm/conversations/${cid}/messages`,
      ann.token,
    );

    expect(thread.body.deletedIds).toEqual([mine]);
  });
});

describe("GET /v1/dm/photos/:id", () => {
  it("serves a member and a super admin, and 404 for strangers, a PT and unsent photos", async () => {
    const me = await trainee();
    const ann = await trainee();
    const stranger = await trainee();
    const boss = await admin("super_admin");
    const pt = await admin("pt");
    const cid = await conversationBetween(me, ann);
    const sent = await message(cid, me, null);
    const photoId = await dmPhoto(cid, me, sent);
    const get = (token: string | null, id: number | string = photoId) =>
      callWith(app, "get", `/v1/dm/photos/${id}`, token);

    const ok = await get(ann.token);

    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/png");
    expect(ok.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(Buffer.compare(ok.body, pngBytes(40, 30, 200))).toBe(0);
    expect((await get(boss.token)).status).toBe(200);
    for (const token of [stranger.token, pt.token]) {
      expect((await get(token)).status).toBe(404);
    }
    expect((await get(null)).status).toBe(401);
    expect((await get(me.token, 999999)).status).toBe(404);
    expect((await get(me.token, "abc")).status).toBe(400);
    await ds
      .getRepository(SocialBlock)
      .save({ blockerId: ann.id, blockedId: me.id, createdAt: clock.now() });
    expect((await get(me.token)).status).toBe(404);
    expect((await get(boss.token)).status).toBe(200);
    await ds
      .getRepository(DmMessage)
      .update({ id: sent }, { deletedAt: clock.now() });
    expect((await get(boss.token)).status).toBe(404);
  });

  it("does not serve a pending upload", async () => {
    const me = await trainee();
    const ann = await trainee();
    const cid = await conversationBetween(me, ann);
    const pending = await ds.getRepository(DmPhoto).save({
      conversationId: cid,
      messageId: null,
      uploaderId: me.id,
      mime: "image/png",
      width: 1,
      height: 1,
      data: pngBytes(),
      size: 33,
      createdAt: clock.now(),
    });

    expect(
      (await callWith(app, "get", `/v1/dm/photos/${pending.id}`, me.token))
        .status,
    ).toBe(404);
  });
});

describe("GET /v1/admin/dm/conversations", () => {
  it("lists every conversation for a super admin, with names and previews", async () => {
    const boss = await admin("super_admin");
    const pt = await admin("pt");
    const ann = await trainee({ name: "Ann Low" });
    const bob = await trainee({ name: "Bob High" });
    const cid = await conversationBetween(ann, bob);

    await message(cid, ann, "xin chào");
    const gone = await message(cid, bob, "sẽ xoá");

    await ds
      .getRepository(DmMessage)
      .update({ id: gone }, { deletedAt: clock.now() });
    const response = await callWith(
      app,
      "get",
      "/v1/admin/dm/conversations",
      boss.token,
    );
    const row = response.body.conversations.find(
      (item: { id: number }) => item.id === cid,
    );

    expect(response.status).toBe(200);
    expect(row).toEqual({
      id: cid,
      lowName: ann.id < bob.id ? "Ann Low" : "Bob High",
      highName: ann.id < bob.id ? "Bob High" : "Ann Low",
      lastMessageAt: expect.any(String),
      preview: DM_MESSAGES.UNSENT,
    });
    expect(
      (await callWith(app, "get", "/v1/admin/dm/conversations", pt.token))
        .status,
    ).toBe(403);
    expect(
      (await callWith(app, "get", "/v1/admin/dm/conversations", ann.token))
        .status,
    ).toBe(403);
    expect(
      (await callWith(app, "get", "/v1/admin/dm/conversations", null)).status,
    ).toBe(401);
  });
});

describe("dmCount in the trainee badge", () => {
  it("adds the friend chats to the Messages badge next to the coach chat", async () => {
    const me = await trainee();
    const ann = await trainee();

    await enableChat(ds, me.id);
    const cid = await conversationBetween(me, ann);

    await message(cid, ann, "một");
    const badge = (await callWith(app, "get", "/v1/chat/unread", me.token))
      .body;

    expect(badge).toMatchObject({
      count: 1,
      coachCount: 0,
      dmCount: 1,
      hasHistory: false,
      latestLoudIncomingId: null,
    });
  });
});
