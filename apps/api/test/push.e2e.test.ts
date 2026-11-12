import type { INestApplication } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { PUSH_SENDERS } from "../src/push/push-sender.js";
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
  enableChat,
  ensureConversation,
  newKey,
} from "./support/chat.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import {
  FakeWebSender,
  newEndpoint,
  subscriptionBody,
} from "./support/push.js";
import { pause } from "./support/realtime.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let clock: FakeClock;
const sender = new FakeWebSender();

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  clock = new FakeClock();
  app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [
      { token: Clock, value: clock },
      { token: PUSH_SENDERS, value: [sender] },
    ],
    env: { VAPID_PUBLIC_KEY: "public-key-for-tests" },
  });
});

afterAll(async () => {
  // Pushes run after the response; let the last ones finish first.
  await pause(300);
  await app.close();
  await db.drop();
});

// Every test starts with no devices registered, so one test's PTs never hear
// about another's messages.
beforeEach(async () => {
  sender.reset();
  await ds.query(`DELETE FROM push_subscriptions`);
});

const trainee = async (
  options: { ptAdminId?: number; chat?: boolean; name?: string } = {},
) => {
  const row = await seedUser(ds, {
    ptAdminId: options.ptAdminId ?? null,
    ...(options.name ? { name: options.name } : {}),
  });

  if (options.chat !== false) {
    await enableChat(ds, row.id);
  }
  return { ...row, token: await tokenOf(app, { kind: "user", ...row }) };
};

const admin = async (role: "super_admin" | "pt" = "pt") => {
  const row = await seedAdmin(ds, { role });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

// Registers a device for the caller and returns its endpoint.
const device = async (token: string) => {
  const endpoint = newEndpoint();
  const response = await callWith(
    app,
    "post",
    "/v1/push/subscriptions",
    token,
    {
      body: subscriptionBody(endpoint),
    },
  );

  expect(response.status).toBe(204);
  return endpoint;
};

const send = (token: string, body: object) =>
  callWith(app, "post", "/v1/chat/conversations/me/messages", token, {
    body,
    headers: { "Idempotency-Key": newKey() },
  });

const ptSend = (token: string, userId: number, body: object) =>
  callWith(app, "post", `/v1/chat/trainees/${userId}/messages`, token, {
    body,
    headers: { "Idempotency-Key": newKey() },
  });

const stored = (endpoint: string) =>
  ds.query(
    `SELECT owner_key AS "ownerKey", kind, user_agent AS "userAgent",
            last_success_at AS "lastSuccessAt", p256dh, auth
     FROM push_subscriptions WHERE endpoint = $1`,
    [endpoint],
  ) as Promise<
    {
      ownerKey: string;
      kind: string;
      userAgent: string;
      lastSuccessAt: Date | null;
      p256dh: string;
      auth: string;
    }[]
  >;

describe("subscriptions", () => {
  it("saves a web device (kind defaults to web), lists it and forgets it", async () => {
    const me = await trainee();
    const endpoint = newEndpoint();
    const saved = await callWith(
      app,
      "post",
      "/v1/push/subscriptions",
      me.token,
      {
        body: subscriptionBody(endpoint),
      },
    );

    expect(saved.status).toBe(204);
    expect(await stored(endpoint)).toEqual([
      {
        ownerKey: `user:${me.id}`,
        kind: "web",
        userAgent: "",
        lastSuccessAt: null,
        p256dh: "p256dh-key",
        auth: "auth-secret",
      },
    ]);
    const listed = await callWith(
      app,
      "get",
      "/v1/push/subscriptions",
      me.token,
    );

    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
      subscriptions: [
        {
          id: expect.any(Number),
          kind: "web",
          endpoint,
          userAgent: "",
          createdAt: clockIso(await createdAt(endpoint)),
          lastSuccessAt: null,
        },
      ],
    });
    // Keys never leave the server.
    expect(JSON.stringify(listed.body)).not.toContain("auth-secret");

    const removed = await callWith(
      app,
      "delete",
      "/v1/push/subscriptions",
      me.token,
      {
        body: { endpoint },
      },
    );

    expect(removed.status).toBe(204);
    expect(await stored(endpoint)).toEqual([]);
    expect(
      (await callWith(app, "get", "/v1/push/subscriptions", me.token)).body,
    ).toEqual({ subscriptions: [] });
  });

  it("moves a device to the account that subscribes with it next", async () => {
    const first = await trainee();
    const second = await trainee();
    const endpoint = await device(first.token);

    await callWith(app, "post", "/v1/push/subscriptions", second.token, {
      body: subscriptionBody(endpoint),
    });
    expect((await stored(endpoint))[0].ownerKey).toBe(`user:${second.id}`);
    expect(
      (await callWith(app, "get", "/v1/push/subscriptions", first.token)).body,
    ).toEqual({ subscriptions: [] });
  });

  it("lets nobody remove another account's device", async () => {
    const owner = await trainee();
    const other = await trainee();
    const endpoint = await device(owner.token);

    const attempt = await callWith(
      app,
      "delete",
      "/v1/push/subscriptions",
      other.token,
      {
        body: { endpoint },
      },
    );

    expect(attempt.status).toBe(204);
    expect(await stored(endpoint)).toHaveLength(1);
  });

  it("stores an admin's device under the admin key", async () => {
    const pt = await admin();
    const endpoint = await device(pt.token);

    expect((await stored(endpoint))[0].ownerKey).toBe(`admin:${pt.id}`);
  });

  it("refuses unknown push services, other kinds, malformed bodies and no session", async () => {
    const me = await trainee();
    const post = (body: object | undefined, token: string | null = me.token) =>
      callWith(
        app,
        "post",
        "/v1/push/subscriptions",
        token,
        body ? { body } : {},
      );

    expect(
      (
        await post({
          endpoint: "https://internal.example/push",
          keys: { p256dh: "a", auth: "b" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          endpoint: "http://fcm.googleapis.com/x",
          keys: { p256dh: "a", auth: "b" },
        })
      ).status,
    ).toBe(400);
    expect(
      (await post({ ...subscriptionBody(newEndpoint()), kind: "expo" })).status,
    ).toBe(400);
    expect((await post({ endpoint: newEndpoint() })).status).toBe(400);
    expect((await post(subscriptionBody(newEndpoint()), null)).status).toBe(
      401,
    );
    expect(
      (
        await callWith(app, "delete", "/v1/push/subscriptions", me.token, {
          body: {},
        })
      ).status,
    ).toBe(400);
  });

  it("tells clients whether push is on and the VAPID public key", async () => {
    const me = await trainee();
    const config = await callWith(app, "get", "/v1/push/config", me.token);

    expect(config.body).toEqual({
      web: { enabled: true, publicKey: "public-key-for-tests" },
    });
    expect((await callWith(app, "get", "/v1/push/config", null)).status).toBe(
      401,
    );
  });
});

const createdAt = async (endpoint: string) =>
  (
    (await ds.query(
      `SELECT created_at AS at FROM push_subscriptions WHERE endpoint = $1`,
      [endpoint],
    )) as { at: Date }[]
  )[0].at;

const clockIso = (date: Date) => date.toISOString();

describe("a trainee message", () => {
  it("pushes the PT team that may hear it, with the web's title, body and link", async () => {
    const ptA = await admin("pt");
    const ptB = await admin("pt");
    const boss = await admin("super_admin");
    const me = await trainee({
      ptAdminId: ptA.id,
      name: `An Nguyễn ${Date.now()}`,
    });
    const devices = {
      ptA: await device(ptA.token),
      ptB: await device(ptB.token),
      boss: await device(boss.token),
      mine: await device(me.token),
    };

    await send(me.token, { body: "  Chào   PT\n\n\n\nhôm nay  " });
    const conversationId = await ensureConversation(ds, me.id);

    await sender.waitForCalls(2);
    await pause(300);
    expect(sender.calls).toHaveLength(2);
    expect(sender.to(devices.ptB)).toEqual([]);
    expect(sender.to(devices.mine)).toEqual([]);
    expect(sender.to(devices.ptA)[0].payload).toEqual({
      title: me.name,
      body: "Chào PT\n\nhôm nay",
      url: `/admin/users/${me.id}/messages`,
      tag: `chat-${conversationId}`,
    });
    expect(sender.to(devices.boss)[0].payload).toEqual(
      sender.to(devices.ptA)[0].payload,
    );
    expect(sender.to(devices.ptA)[0].subscription).toMatchObject({
      kind: "web",
      ownerKey: `admin:${ptA.id}`,
    });
    // The delivery is recorded.
    expect((await stored(devices.ptA))[0].lastSuccessAt).not.toBeNull();
  });

  it("uses the PT's own nickname for the trainee, and their language", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const endpoint = await device(pt.token);

    await ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, $2, 'Anh An', now())`,
      [`admin:${pt.id}`, `user:${me.id}`],
    );
    await ds.query(`UPDATE admins SET locale = 'en' WHERE id = $1`, [pt.id]);
    await send(me.token, { body: "https://example.com/video" });

    await sender.waitForCalls(1);
    expect(sender.to(endpoint)[0].payload).toMatchObject({
      title: "Anh An",
      body: "Sent a link",
    });
  });

  it("falls back to the localised trainee label when the account has no name", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const endpoint = await device(pt.token);

    await ds.query(`UPDATE admins SET locale = 'zh' WHERE id = $1`, [pt.id]);
    await ds.query(`UPDATE users SET name = '' WHERE id = $1`, [me.id]);
    await send(me.token, { body: "你好" });

    await sender.waitForCalls(1);
    expect(sender.to(endpoint)[0].payload.title).toBe("学员");
  });

  it("sends nothing to a PT who hid the trainee", async () => {
    const pt = await admin("pt");
    const boss = await admin("super_admin");
    const me = await trainee({ ptAdminId: pt.id });
    const hiddenFrom = await device(pt.token);
    const open = await device(boss.token);

    await hideTrainee(ds, pt.id, me.id);
    await send(me.token, { body: "kín" });

    await sender.waitForCalls(1);
    await pause(300);
    expect(sender.calls).toHaveLength(1);
    expect(sender.to(hiddenFrom)).toEqual([]);
    expect(sender.to(open)).toHaveLength(1);
  });

  it("sends nothing for a /imlang message, and nothing for a retried key", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });

    await device(pt.token);
    await send(me.token, { body: "/imlang ngủ ngon" });
    await pause(400);
    expect(sender.calls).toEqual([]);

    const key = newKey();
    const post = () =>
      callWith(app, "post", "/v1/chat/conversations/me/messages", me.token, {
        body: { body: "một lần" },
        headers: { "Idempotency-Key": key },
      });

    await post();
    await sender.waitForCalls(1);
    await post();
    await pause(300);
    expect(sender.calls).toHaveLength(1);
  });

  it("shows a kind label for a sticker", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const endpoint = await device(pt.token);

    const response = await send(me.token, {
      sticker: { pack: "fluent", id: "fire" },
    });

    expect(response.status).toBe(201);
    await sender.waitForCalls(1);
    expect(sender.to(endpoint)[0].payload.body).toBe("Đã gửi sticker");
  });
});

describe("a PT message", () => {
  it("pushes the trainee's devices only, named the way the trainee calls the PT", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const mine = await device(me.token);
    const other = await device(pt.token);

    await ptSend(pt.token, me.id, { body: "Tập chân nhé" });
    const conversationId = await ensureConversation(ds, me.id);

    await sender.waitForCalls(1);
    expect(sender.to(mine)[0].payload).toEqual({
      title: pt.username,
      body: "Tập chân nhé",
      url: "/messages/coach",
      tag: `chat-${conversationId}`,
    });
    expect(sender.to(other)).toEqual([]);

    // The trainee's private nickname for this PT wins; one for the whole PT
    // side is the second choice.
    await ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, 'pt', 'Huấn luyện viên', now())`,
      [`user:${me.id}`],
    );
    await ptSend(pt.token, me.id, { body: "hai" });
    await sender.waitForCalls(2);
    expect(sender.calls[1].payload.title).toBe("Huấn luyện viên");
    await ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, $2, 'Thầy Bình', now())`,
      [`user:${me.id}`, `admin:${pt.id}`],
    );
    await ptSend(pt.token, me.id, { body: "ba" });
    await sender.waitForCalls(3);
    expect(sender.calls[2].payload.title).toBe("Thầy Bình");
  });

  it("speaks the trainee's language", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const mine = await device(me.token);

    await ds.query(`UPDATE users SET locale = 'en' WHERE id = $1`, [me.id]);
    await ptSend(pt.token, me.id, { body: "https://example.com/plan" });

    await sender.waitForCalls(1);
    expect(sender.to(mine)[0].payload.body).toBe("Sent a link");
  });

  it("sends nothing for /imlang", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });

    await device(me.token);
    await ptSend(pt.token, me.id, { body: "/imlang nghỉ đi" });
    await pause(400);
    expect(sender.calls).toEqual([]);
  });
});

describe("reactions", () => {
  const react = (token: string, messageId: number, emoji: string) =>
    callWith(app, "put", `/v1/chat/messages/${messageId}/reaction`, token, {
      body: { emoji },
    });

  it("tells only the author, with the reactor, the emoji and a link, never the text", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const mine = await device(me.token);
    const team = await device(pt.token);
    const sent = await send(me.token, { body: "bí mật" });
    const messageId = sent.body.message.id as number;
    const conversationId = await ensureConversation(ds, me.id);

    await sender.waitForCalls(1);
    sender.reset();

    await react(pt.token, messageId, "💪");
    await sender.waitForCalls(1);
    expect(sender.to(mine)[0].payload).toEqual({
      title: "PT App",
      body: `${pt.username} đã thả 💪 vào tin nhắn của bạn`,
      url: "/messages/coach",
      tag: `chat-react-${conversationId}`,
    });
    expect(JSON.stringify(sender.calls)).not.toContain("bí mật");

    // Replacing the emoji pushes again; removing it and reacting to your own
    // message push nothing.
    await react(pt.token, messageId, "❤️");
    await sender.waitForCalls(2);
    expect(sender.calls[1].payload.body).toContain("❤️");
    await callWith(
      app,
      "delete",
      `/v1/chat/messages/${messageId}/reaction`,
      pt.token,
    );
    await react(me.token, messageId, "👍");
    await pause(400);
    expect(sender.calls).toHaveLength(2);
    expect(sender.to(team)).toEqual([]);
  });

  it("tells a PT who wrote the message that the trainee reacted, in the PT's language", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const team = await device(pt.token);

    await ds.query(`UPDATE admins SET locale = 'en' WHERE id = $1`, [pt.id]);
    const sent = await ptSend(pt.token, me.id, { body: "uống nước" });

    await react(me.token, sent.body.message.id, "👍");
    await sender.waitForCalls(1);
    expect(sender.to(team)[0].payload).toMatchObject({
      title: "PT App",
      body: `${me.name} reacted 👍 to your message`,
      url: `/admin/users/${me.id}/messages`,
    });
  });

  it("does not tell a PT who may no longer hear about the trainee", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });

    await device(pt.token);
    const sent = await ptSend(pt.token, me.id, { body: "ẩn" });

    await hideTrainee(ds, pt.id, me.id);
    await react(me.token, sent.body.message.id, "👍");
    await pause(400);
    expect(sender.calls).toEqual([]);
  });
});

describe("delivery", () => {
  it("deletes a device that answers gone and keeps the others", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const dead = await device(pt.token);
    const alive = await device(pt.token);

    sender.answers.set(dead, ["gone"]);
    await send(me.token, { body: "xin chào" });

    await sender.waitForCalls(2);
    await pause(150);
    expect(await stored(dead)).toEqual([]);
    expect(await stored(alive)).toHaveLength(1);
    expect((await stored(alive))[0].lastSuccessAt).not.toBeNull();
  });

  it("retries a temporary failure and records the success", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const flaky = await device(pt.token);

    sender.answers.set(flaky, ["retry", "retry", "ok"]);
    await send(me.token, { body: "thử lại" });

    await sender.waitForCalls(3);
    await pause(150);
    expect(sender.to(flaky)).toHaveLength(3);
    expect((await stored(flaky))[0].lastSuccessAt).not.toBeNull();
  });

  it("keeps a device that keeps failing, and the message still goes through", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const down = await device(pt.token);

    sender.answers.set(down, ["retry", "retry", "retry"]);
    const response = await send(me.token, { body: "vẫn gửi được" });

    expect(response.status).toBe(201);
    await sender.waitForCalls(3);
    await pause(150);
    expect(await stored(down)).toHaveLength(1);
    expect((await stored(down))[0].lastSuccessAt).toBeNull();
  });

  it("sends nothing when no sender is switched on", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const endpoint = await device(pt.token);

    sender.enabled = false;
    try {
      await send(me.token, { body: "tắt" });
      await pause(400);
      expect(sender.to(endpoint)).toEqual([]);
      expect(
        (await callWith(app, "get", "/v1/push/config", me.token)).body,
      ).toEqual({ web: { enabled: false, publicKey: null } });
    } finally {
      sender.enabled = true;
    }
  });
});

describe("conversations created by a push", () => {
  it("works for a conversation that exists already", async () => {
    const me = await trainee();

    await ensureConversation(ds, me.id);
    expect((await send(me.token, { body: "ok" })).status).toBe(201);
  });
});
