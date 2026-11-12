import type { INestApplication } from "@nestjs/common";
import { REALTIME_TICKET_TTL_SECONDS } from "@pt/contracts";
import type { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { ChatGateway } from "../src/realtime/chat.gateway.js";
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
  connectClient,
  listenOnRandomPort,
  pause,
  type Rejection,
  type TestClient,
} from "./support/realtime.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let clock: FakeClock;
let url: string;
const open: TestClient[] = [];

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  clock = new FakeClock();
  app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: Clock, value: clock }],
  });
  url = await listenOnRandomPort(app);
});

afterEach(() => {
  for (const client of open.splice(0)) {
    client.close();
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
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

const track = async (promise: Promise<TestClient>) => {
  const client = await promise;

  open.push(client);
  return client;
};

const ticketOf = async (token: string) => {
  const response = await callWith(app, "post", "/v1/realtime/ticket", token);

  expect(response.status).toBe(200);
  return response.body.ticket as string;
};

const withTicket = async (
  token: string,
  headers: Record<string, string> = {},
) => track(connectClient(url, { ticket: await ticketOf(token) }, headers));

const withToken = (token: string) => track(connectClient(url, { token }));

const refusal = async (promise: Promise<TestClient>) => {
  try {
    open.push(await promise);
  } catch (error) {
    return error as Rejection;
  }
  throw new Error("The handshake was accepted");
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

const unlock = (token: string, passcode: string) =>
  callWith(app, "post", "/v1/admins/me/passcode/verify", token, {
    body: { passcode },
  });

describe("the handshake", () => {
  it("issues a ticket to a signed-in caller only", async () => {
    const me = await trainee();
    const response = await callWith(
      app,
      "post",
      "/v1/realtime/ticket",
      me.token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ticket: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresInSeconds: REALTIME_TICKET_TTL_SECONDS,
      namespace: "/chat",
    });
    expect(
      (await callWith(app, "post", "/v1/realtime/ticket", null)).status,
    ).toBe(401);
  });

  it("accepts a ticket, once", async () => {
    const me = await trainee();
    const ticket = await ticketOf(me.token);
    const first = await track(connectClient(url, { ticket }));

    expect(first.socket.connected).toBe(true);
    expect(await refusal(connectClient(url, { ticket }))).toMatchObject({
      code: "ticket_invalid",
    });
  });

  it("refuses an unknown ticket and a ticket older than 60 seconds", async () => {
    const me = await trainee();
    const old = await ticketOf(me.token);

    expect(
      await refusal(connectClient(url, { ticket: "x".repeat(43) })),
    ).toMatchObject({ code: "ticket_invalid" });
    clock.advance((REALTIME_TICKET_TTL_SECONDS + 1) * 1000);
    expect(await refusal(connectClient(url, { ticket: old }))).toMatchObject({
      code: "ticket_invalid",
    });
  });

  it("refuses a ticket whose session ended", async () => {
    const me = await trainee();
    const ticket = await ticketOf(me.token);

    await callWith(app, "post", "/v1/auth/logout", me.token);
    expect(await refusal(connectClient(url, { ticket }))).toMatchObject({
      code: "session_expired",
    });
  });

  it("accepts the opaque session token for mobile and refuses bad ones", async () => {
    const me = await trainee();
    const client = await withToken(me.token);

    expect(client.socket.connected).toBe(true);
    expect(await refusal(connectClient(url, { token: "nope" }))).toMatchObject({
      code: "unauthorized",
    });
    expect(
      await refusal(connectClient(url, { token: "a".repeat(43) })),
    ).toMatchObject({ code: "unauthorized" });
    expect(await refusal(connectClient(url, {}))).toMatchObject({
      code: "unauthorized",
    });
  });

  it("refuses a token whose session was revoked or expired", async () => {
    const revoked = await trainee();
    const expired = await trainee();

    await callWith(app, "post", "/v1/auth/logout", revoked.token);
    expect(
      await refusal(connectClient(url, { token: revoked.token })),
    ).toMatchObject({ code: "unauthorized" });
    await ds.query(`UPDATE sessions SET expires_at = $1 WHERE user_id = $2`, [
      new Date(clock.now().getTime() - 1000),
      expired.id,
    ]);
    expect(
      await refusal(connectClient(url, { token: expired.token })),
    ).toMatchObject({ code: "unauthorized" });
  });

  it("refuses a browser origin other than WEB_ORIGIN", async () => {
    const me = await trainee();

    expect(
      await refusal(
        connectClient(
          url,
          { ticket: await ticketOf(me.token) },
          {
            Origin: "https://evil.example",
          },
        ),
      ),
    ).toMatchObject({ code: "origin_not_allowed" });
    const ok = await withTicket(me.token, { Origin: "http://localhost:3000" });

    expect(ok.socket.connected).toBe(true);
  });

  it("refuses a passcode-locked admin everywhere and accepts them once unlocked", async () => {
    const pt = await admin("pt", "1234");

    expect(
      await refusal(connectClient(url, { token: pt.token })),
    ).toMatchObject({ code: "admin_locked" });
    // A locked session cannot even ask for a ticket.
    const denied = await callWith(app, "post", "/v1/realtime/ticket", pt.token);

    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: "ADMIN_LOCKED" });

    // A ticket taken while unlocked stops working once the admin locks.
    await unlock(pt.token, "1234");
    const ticket = await ticketOf(pt.token);

    await callWith(app, "post", "/v1/admins/me/passcode/lock", pt.token);
    expect(await refusal(connectClient(url, { ticket }))).toMatchObject({
      code: "admin_locked",
    });
    await unlock(pt.token, "1234");
    expect((await withToken(pt.token)).socket.connected).toBe(true);
  });

  it("closes the sockets of a session that signs out, and only that session", async () => {
    const me = await trainee();
    const other = await tokenOf(app, { kind: "user", ...me });
    const here = await withToken(me.token);
    const there = await withToken(other);
    const closed = here.disconnected();

    await callWith(app, "post", "/v1/auth/logout", me.token);
    expect(await here.waitFor("auth:revoked")).toEqual({
      reason: "signed_out",
    });
    await closed;
    await pause(150);
    expect(there.socket.connected).toBe(true);
  });

  it("closes the sockets of an admin who locks, and of an expired session on re-check", async () => {
    const pt = await admin("pt", "1234");

    await unlock(pt.token, "1234");
    const locked = await withToken(pt.token);

    await callWith(app, "post", "/v1/admins/me/passcode/lock", pt.token);
    expect(await locked.waitFor("auth:revoked")).toEqual({ reason: "locked" });

    const me = await trainee();
    const live = await withToken(me.token);

    await ds.query(`UPDATE sessions SET expires_at = $1 WHERE user_id = $2`, [
      new Date(clock.now().getTime() - 1000),
      me.id,
    ]);
    await app.get(ChatGateway).recheck();
    expect(await live.waitFor("auth:revoked")).toEqual({
      reason: "session_expired",
    });
  });
});

describe("message fan-out", () => {
  it("reaches the trainee and their PT, and nobody else", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const boss = await admin("super_admin");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await withTicket(me.token);
    const ptSocket = await withTicket(pt.token);
    const otherSocket = await withTicket(other.token);
    const bossSocket = await withToken(boss.token);

    expect(await ptSocket.ask("subscribe", { conversationId })).toEqual({
      ok: true,
    });
    expect(await bossSocket.ask("subscribe", { conversationId })).toEqual({
      ok: true,
    });
    expect(await otherSocket.ask("subscribe", { conversationId })).toEqual({
      ok: false,
      code: "not_found",
    });

    const sent = await send(me.token, { body: "Chào PT, đừng lộ nội dung" });
    const expected = {
      id: sent.body.message.id,
      conversationId,
      senderRole: "user",
      senderAdminId: null,
      clientId: sent.body.message.clientId,
    };

    for (const client of [mine, ptSocket, bossSocket]) {
      expect(await client.waitFor("message")).toEqual(expected);
    }
    // PT and super admin hear the inbox; text never travels.
    for (const client of [ptSocket, bossSocket]) {
      expect(await client.waitFor("inbox")).toEqual({
        conversationId,
        messageId: sent.body.message.id,
        senderRole: "user",
      });
    }
    await pause(250);
    expect(otherSocket.received).toEqual([]);
    expect(mine.named("inbox")).toEqual([]);
    expect(
      JSON.stringify([...mine.received, ...ptSocket.received]),
    ).not.toContain("lộ nội dung");
  });

  it("tells the trainee about a PT message, naming the PT, and joins a conversation that did not exist", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const mine = await withTicket(me.token);
    const ptSocket = await withTicket(pt.token);

    const sent = await ptSend(pt.token, me.id, { body: "Tập chân nhé" });
    const conversationId = await ensureConversation(ds, me.id);

    expect(await mine.waitFor("message")).toEqual({
      id: sent.body.message.id,
      conversationId,
      senderRole: "admin",
      senderAdminId: pt.id,
      clientId: sent.body.message.clientId,
    });
    // The inbox goes to the PT; the sender was not subscribed to the thread.
    expect(await ptSocket.waitFor("inbox")).toMatchObject({
      conversationId,
      senderRole: "admin",
    });
    expect(ptSocket.named("message")).toEqual([]);
  });

  it("keeps a hidden conversation away until the session reveals it, and again once it ends", async () => {
    const pt = await admin("pt", "1234");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);

    await unlock(pt.token, "1234");
    await hideTrainee(ds, pt.id, me.id);
    const ptSocket = await withToken(pt.token);

    expect(await ptSocket.ask("subscribe", { conversationId })).toEqual({
      ok: false,
      code: "not_found",
    });
    await send(me.token, { body: "ẩn" });
    await pause(300);
    expect(ptSocket.received).toEqual([]);

    await callWith(app, "post", "/v1/admins/me/hidden-users/reveal", pt.token, {
      body: { passcode: "1234" },
    });
    expect(await ptSocket.ask("subscribe", { conversationId })).toEqual({
      ok: true,
    });
    const shown = await send(me.token, { body: "đã mở" });

    expect((await ptSocket.waitFor("message")).id).toBe(shown.body.message.id);
    expect((await ptSocket.waitFor("inbox")).messageId).toBe(
      shown.body.message.id,
    );

    // The reveal window ends: the socket stops hearing, though still joined.
    await ds.query(
      `UPDATE sessions SET revealed_until = NULL WHERE admin_id = $1`,
      [pt.id],
    );
    ptSocket.received.length = 0;
    await send(me.token, { body: "lại ẩn" });
    await pause(300);
    expect(ptSocket.received).toEqual([]);
  });

  it("edit, unsend and reaction send message-update with ids only", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await withToken(me.token);
    const ptSocket = await withToken(pt.token);

    await ptSocket.ask("subscribe", { conversationId });
    const sent = await send(me.token, { body: "bản đầu" });
    const messageId = sent.body.message.id as number;
    const updateOf = (client: TestClient, count: number) =>
      client.waitFor(
        "message-update",
        () => client.named("message-update").length >= count,
      );

    await callWith(app, "patch", `/v1/chat/messages/${messageId}`, me.token, {
      body: { body: "bản sửa" },
    });
    await updateOf(ptSocket, 1);
    await callWith(
      app,
      "put",
      `/v1/chat/messages/${messageId}/reaction`,
      pt.token,
      {
        body: { emoji: "💪" },
      },
    );
    await updateOf(ptSocket, 2);
    await callWith(app, "delete", `/v1/chat/messages/${messageId}`, me.token);
    await updateOf(ptSocket, 3);

    for (const client of [ptSocket, mine]) {
      await updateOf(client, 3);
      expect(client.named("message-update")).toEqual([
        { conversationId, messageId },
        { conversationId, messageId },
        { conversationId, messageId },
      ]);
    }
    expect(JSON.stringify(ptSocket.received)).not.toContain("bản sửa");
  });

  it("sends read cursors to the other side", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await withToken(me.token);
    const ptSocket = await withToken(pt.token);

    await ptSocket.ask("subscribe", { conversationId });
    const sent = await ptSend(pt.token, me.id, { body: "đọc đi" });
    const messageId = sent.body.message.id as number;

    await callWith(app, "post", "/v1/chat/conversations/me/read", me.token, {
      body: { lastReadMessageId: messageId },
    });
    expect(await ptSocket.waitFor("read")).toEqual({
      conversationId,
      readerKey: "user",
      lastReadMessageId: messageId,
    });
    await callWith(
      app,
      "post",
      `/v1/chat/conversations/${conversationId}/read`,
      pt.token,
      {
        body: { lastReadMessageId: messageId },
      },
    );
    expect(
      await mine.waitFor("read", (data) => data.readerKey === `admin:${pt.id}`),
    ).toEqual({
      conversationId,
      readerKey: `admin:${pt.id}`,
      lastReadMessageId: messageId,
    });
  });

  it("tells the trainee, once, when the PT switches chat on or off", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id, chat: false });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await withToken(me.token);
    const ptSocket = await withToken(pt.token);

    await ptSocket.ask("subscribe", { conversationId });
    await callWith(app, "put", `/v1/chat/trainees/${me.id}/enabled`, pt.token, {
      body: { enabled: true },
    });
    expect(await mine.waitFor("chat-status")).toEqual({ enabled: true });
    expect(await ptSocket.waitFor("chat-status")).toEqual({ enabled: true });
    await pause(200);
    expect(mine.named("chat-status")).toHaveLength(1);
  });

  it("sends profile-update for a conversation colour, and for an account colour with the cursor moved", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await withToken(me.token);
    const ptSocket = await withToken(pt.token);
    const cursor = async () =>
      (
        await callWith(
          app,
          "get",
          "/v1/chat/conversations/me/messages",
          me.token,
        )
      ).body.lastChangeAt as number | null;

    await ptSocket.ask("subscribe", { conversationId });
    await callWith(
      app,
      "put",
      `/v1/chat/conversations/${conversationId}/color`,
      pt.token,
      {
        body: { color: "orange" },
      },
    );
    expect(await mine.waitFor("profile-update")).toEqual({ conversationId });
    mine.received.length = 0;
    ptSocket.received.length = 0;

    const before = await cursor();
    const traineeColor = await callWith(
      app,
      "put",
      "/v1/users/me/chat-color",
      me.token,
      {
        body: { color: "purple" },
      },
    );

    expect(traineeColor.status).toBe(200);
    expect(await ptSocket.waitFor("profile-update")).toEqual({
      conversationId,
    });
    const afterTrainee = await cursor();

    expect(afterTrainee).toBeGreaterThan(before ?? 0);

    const adminColor = await callWith(
      app,
      "put",
      "/v1/admins/me/chat-color",
      pt.token,
      {
        body: { color: "red" },
      },
    );

    expect(adminColor.status).toBe(200);
    expect(
      await mine.waitFor(
        "profile-update",
        () => mine.named("profile-update").length >= 2,
      ),
    ).toEqual({ conversationId });
    expect(await cursor()).toBeGreaterThan(afterTrainee ?? 0);
  });

  it("an out-of-reach PT colour change does not move another PT's trainee", async () => {
    const pt = await admin("pt");
    const stranger = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });

    await ensureConversation(ds, me.id);
    const cursor = async () =>
      (
        await callWith(
          app,
          "get",
          "/v1/chat/conversations/me/messages",
          me.token,
        )
      ).body.lastChangeAt as number | null;
    const before = await cursor();

    await callWith(app, "put", "/v1/admins/me/chat-color", stranger.token, {
      body: { color: "red" },
    });
    expect(await cursor()).toBe(before);
  });

  it("sends trainee-chat unsends and reads to the two members only", async () => {
    const a = await trainee();
    const b = await trainee();
    const c = await trainee();
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const [conversation] = (await ds.query(
      `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now()) RETURNING id`,
      [low, high],
    )) as { id: number }[];
    const [message] = (await ds.query(
      `INSERT INTO dm_messages (conversation_id, sender_id, body, client_id, created_at)
       VALUES ($1, $2, 'xin chào', 'dm-client-1', now()) RETURNING id`,
      [conversation.id, a.id],
    )) as { id: number }[];

    await ds.query(
      `UPDATE dm_conversations SET last_message_id = $2 WHERE id = $1`,
      [conversation.id, message.id],
    );
    await ds.query(`UPDATE users SET terms_version = 1 WHERE id = ANY($1)`, [
      [a.id, b.id, c.id],
    ]);
    const first = await withToken(a.token);
    const second = await withToken(b.token);
    const third = await withToken(c.token);

    await callWith(app, "delete", `/v1/dm/messages/${message.id}`, a.token);
    const expected = {
      conversationId: conversation.id,
      messageId: message.id,
      senderId: a.id,
    };

    expect(await first.waitFor("dm:update")).toEqual(expected);
    expect(await second.waitFor("dm:update")).toEqual(expected);
    await callWith(
      app,
      "post",
      `/v1/dm/conversations/${conversation.id}/read`,
      b.token,
    );
    expect(await first.waitFor("dm:read")).toEqual({
      conversationId: conversation.id,
      userId: b.id,
      lastReadMessageId: message.id,
    });
    await pause(250);
    expect(third.received).toEqual([]);
  });
});

describe("typing", () => {
  it("relays to the other side, never to the sender, and drops the excess", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await withToken(me.token);
    const second = await withToken(me.token);
    const ptSocket = await withToken(pt.token);

    await ptSocket.ask("subscribe", { conversationId });
    expect(await mine.ask("typing")).toEqual({ ok: true, relayed: true });
    expect(await ptSocket.waitFor("typing")).toEqual({
      role: "user",
      senderKey: `user:${me.id}`,
      conversationId,
    });
    // A second tab of the same person gets it too (it ignores its own key).
    expect((await second.waitFor("typing")).senderKey).toBe(`user:${me.id}`);

    // Inside the 2.5 s window: dropped, acknowledged, not relayed.
    expect(await mine.ask("typing")).toEqual({ ok: true, relayed: false });
    await pause(200);
    expect(ptSocket.named("typing")).toHaveLength(1);
    expect(mine.named("typing")).toEqual([]);

    clock.advance(2500);
    expect(await mine.ask("typing")).toEqual({ ok: true, relayed: true });
    await ptSocket.waitFor(
      "typing",
      () => ptSocket.named("typing").length >= 2,
    );

    expect(await ptSocket.ask("typing", { conversationId })).toEqual({
      ok: true,
      relayed: true,
    });
    expect(await mine.waitFor("typing")).toEqual({
      role: "admin",
      senderKey: `admin:${pt.id}`,
      conversationId,
    });
  });

  it("refuses a PT outside the workspace, a missing conversation id and a bad payload", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const stranger = await withToken(other.token);
    const owner = await withToken(pt.token);

    expect(await stranger.ask("typing", { conversationId })).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await owner.ask("typing")).toEqual({ ok: false, code: "not_found" });
    expect(await owner.ask("typing", { conversationId: "x" })).toEqual({
      ok: false,
      code: "invalid",
    });
    expect(await owner.ask("subscribe", { conversationId: -1 })).toEqual({
      ok: false,
      code: "invalid",
    });
  });

  it("refuses typing in a locked chat", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id, chat: false });
    const conversationId = await ensureConversation(ds, me.id);
    const mine = await withToken(me.token);
    const ptSocket = await withToken(pt.token);

    expect(await mine.ask("typing")).toEqual({
      ok: false,
      code: "chat_locked",
    });
    expect(await ptSocket.ask("typing", { conversationId })).toEqual({
      ok: false,
      code: "chat_locked",
    });
  });

  it("has a REST fallback with the same rules", async () => {
    const pt = await admin("pt");
    const other = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const ptSocket = await withToken(pt.token);

    await ptSocket.ask("subscribe", { conversationId });
    const own = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/typing",
      me.token,
    );

    expect(own.status).toBe(204);
    expect((await ptSocket.waitFor("typing")).senderKey).toBe(`user:${me.id}`);
    expect(
      (
        await callWith(
          app,
          "post",
          `/v1/chat/conversations/${conversationId}/typing`,
          other.token,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await callWith(
          app,
          "post",
          `/v1/chat/conversations/${conversationId}/typing`,
          pt.token,
        )
      ).status,
    ).toBe(204);
  });
});

describe("following a conversation", () => {
  it("lets an admin unsubscribe", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const conversationId = await ensureConversation(ds, me.id);
    const ptSocket = await withToken(pt.token);

    await ptSocket.ask("subscribe", { conversationId });
    expect(await ptSocket.ask("unsubscribe", { conversationId })).toEqual({
      ok: true,
    });
    await send(me.token, { body: "ai nghe" });
    await pause(300);
    expect(ptSocket.named("message")).toEqual([]);
    expect(ptSocket.named("inbox")).toHaveLength(1);
  });
});
