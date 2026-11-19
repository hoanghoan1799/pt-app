import type { INestApplication } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { ChatConversation } from "../src/database/entities/chat-conversation.entity.js";
import { createTestApp } from "./support/app.js";
import { FakeClock, seedAdmin, seedUser, tokenOf } from "./support/auth.js";
import {
  callWith,
  captureEvents,
  enableChat,
  ensureConversation,
  newKey,
} from "./support/chat.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

// Messenger-style shared nicknames: anyone in the conversation sets or clears
// the nickname of anyone in it, everybody sees the same ones.

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

const admin = async (role: "super_admin" | "pt" = "pt") => {
  const row = await seedAdmin(ds, { role });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

type Pt = Awaited<ReturnType<typeof admin>>;
type Trainee = Awaited<ReturnType<typeof trainee>>;

// A trainee of this PT with a conversation.
const pair = async (pt: Pt) => {
  const me = await trainee({ ptAdminId: pt.id });
  const conversationId = await ensureConversation(ds, me.id);

  return { me, conversationId };
};

const meNickname = (me: Trainee, target: string, nickname: string) =>
  callWith(app, "put", "/v1/chat/conversations/me/nickname", me.token, {
    body: { target, nickname },
  });

const ptNickname = (
  pt: Pt,
  conversationId: number,
  target: string,
  nickname: string,
) =>
  callWith(
    app,
    "put",
    `/v1/chat/conversations/${conversationId}/nickname`,
    pt.token,
    { body: { target, nickname } },
  );

const stored = async (conversationId: number) =>
  (await ds.query(
    `SELECT target_key AS "targetKey", nickname, set_by_key AS "setByKey"
     FROM chat_nicknames WHERE conversation_id = $1 ORDER BY target_key`,
    [conversationId],
  )) as { targetKey: string; nickname: string; setByKey: string }[];

const cursor = async (conversationId: number) =>
  (await ds.getRepository(ChatConversation).findOneByOrFail({
    id: conversationId,
  }))!.lastChangeAt?.getTime() ?? 0;

describe("setting a nickname", () => {
  it("lets either side name anybody in the conversation, themselves included, and records who set it", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    // The trainee names the PT side, one PT and themselves.
    const first = await meNickname(me, "pt", "Thầy");

    expect(first.status).toBe(200);
    expect(first.body.profile.nicknames).toEqual({ pt: "Thầy" });
    await meNickname(me, `admin:${pt.id}`, "Coach");
    await meNickname(me, "user", "Na");
    // The PT renames the trainee; the same row, a new setter.
    await ptNickname(pt, conversationId, "user", "Bé Na");
    // The PT names themselves.
    const last = await ptNickname(pt, conversationId, `admin:${pt.id}`, "HLV");

    expect(last.body.profile.nicknames).toEqual({
      pt: "Thầy",
      user: "Bé Na",
      [`admin:${pt.id}`]: "HLV",
    });
    expect(await stored(conversationId)).toEqual(
      [
        { targetKey: "pt", nickname: "Thầy", setByKey: "user" },
        { targetKey: "user", nickname: "Bé Na", setByKey: `admin:${pt.id}` },
        {
          targetKey: `admin:${pt.id}`,
          nickname: "HLV",
          setByKey: `admin:${pt.id}`,
        },
      ].sort((a, b) => a.targetKey.localeCompare(b.targetKey)),
    );
  });

  it("shows both sides the same nicknames, in the thread, the header and the inbox, and ignores private aliases", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    await callWith(app, "put", `/v1/contact-aliases/user:${me.id}`, pt.token, {
      body: { alias: "Riêng của PT" },
    });
    await callWith(app, "put", "/v1/contact-aliases/pt", me.token, {
      body: { alias: "Riêng của học viên" },
    });
    await meNickname(me, "pt", "Thầy");
    await ptNickname(pt, conversationId, "user", "Bé Na");

    const mine = await callWith(
      app,
      "get",
      "/v1/chat/conversations/me/messages",
      me.token,
    );
    const theirs = await callWith(
      app,
      "get",
      `/v1/chat/conversations/${conversationId}/messages`,
      pt.token,
    );

    expect(mine.body.profile.nicknames).toEqual({ pt: "Thầy", user: "Bé Na" });
    expect(theirs.body.profile.nicknames).toEqual(mine.body.profile.nicknames);
    const header = await callWith(
      app,
      "get",
      `/v1/chat/conversations/${conversationId}`,
      pt.token,
    );

    expect(header.body).toMatchObject({
      userName: me.name,
      displayName: "Bé Na",
    });
    const inbox = await callWith(app, "get", "/v1/chat/inbox", pt.token);

    expect(inbox.body.conversations[0]).toMatchObject({
      userName: me.name,
      displayName: "Bé Na",
    });
  });

  it("does not leak into another conversation", async () => {
    const pt = await admin("pt");
    const first = await pair(pt);
    const second = await pair(pt);

    await ptNickname(pt, first.conversationId, "user", "Một");
    await ptNickname(pt, first.conversationId, `admin:${pt.id}`, "HLV");

    const other = await callWith(
      app,
      "get",
      "/v1/chat/conversations/me/messages",
      second.me.token,
    );

    expect(other.body.profile.nicknames).toEqual({});
    expect(await stored(second.conversationId)).toEqual([]);
  });

  it("treats a blank nickname as clear and deletes the row", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    await meNickname(me, "pt", "Thầy");
    expect(await stored(conversationId)).toHaveLength(1);

    const cleared = await meNickname(me, "pt", "   ");

    expect(cleared.status).toBe(200);
    expect(cleared.body.profile.nicknames).toEqual({});
    expect(await stored(conversationId)).toEqual([]);
    // Clearing what is not set is fine too.
    expect((await meNickname(me, "pt", "")).status).toBe(200);
  });

  it("trims and collapses whitespace before storing", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    await meNickname(me, "pt", "  Thầy   Hoàn  ");
    expect((await stored(conversationId))[0].nickname).toBe("Thầy Hoàn");
  });

  it("bumps the change cursor and tells the room once per real change, not for a no-op", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);
    const before = await cursor(conversationId);

    await meNickname(me, "pt", "Thầy");
    const after = await cursor(conversationId);

    expect(after).toBeGreaterThan(before);
    expect(events.named("chat.profile.changed")).toEqual([
      {
        name: "chat.profile.changed",
        payload: {
          conversationId,
          traineeUserId: me.id,
          changedAt: after,
        },
      },
    ]);

    // The same value again, from the other side: nothing moves.
    await ptNickname(pt, conversationId, "pt", "Thầy");
    expect(await cursor(conversationId)).toBe(after);
    expect(events.named("chat.profile.changed")).toHaveLength(1);
    // Clearing something never set is a no-op as well.
    await meNickname(me, "user", "");
    expect(events.named("chat.profile.changed")).toHaveLength(1);
    // A real change moves it again.
    await ptNickname(pt, conversationId, "pt", "Thầy Hoàn");
    expect(events.named("chat.profile.changed")).toHaveLength(2);
    expect(await cursor(conversationId)).toBeGreaterThan(after);
  });

  it("defeats the trainee's 204 fast path so the other side's change is picked up", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);
    const sent = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/messages",
      me.token,
      { body: { body: "chào" }, headers: { "Idempotency-Key": newKey() } },
    );
    const last = sent.body.message.id as number;
    const first = await callWith(
      app,
      "get",
      "/v1/chat/conversations/me/messages",
      me.token,
    );
    const seen = first.body.lastChangeAt as number;
    const poll = () =>
      callWith(
        app,
        "get",
        `/v1/chat/conversations/me/messages?after=${last}&readUpTo=0&enabled=1&changedSince=${seen}`,
        me.token,
      );

    expect((await poll()).status).toBe(204);
    await ptNickname(pt, conversationId, "user", "Bé Na");
    const changed = await poll();

    expect(changed.status).toBe(200);
    expect(changed.body.profile.nicknames).toEqual({ user: "Bé Na" });
  });

  it("is silent: no message, no push event, only the profile update", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    await meNickname(me, "pt", "Thầy");
    await ptNickname(pt, conversationId, "user", "Bé Na");

    expect(
      await ds.query(
        `SELECT 1 FROM chat_messages WHERE conversation_id = $1`,
        [conversationId],
      ),
    ).toEqual([]);
    expect(events.all.map((event) => event.name)).toEqual([
      "chat.profile.changed",
      "chat.profile.changed",
    ]);
  });
});

describe("who may set which nickname", () => {
  it("accepts 30 characters and refuses 31, control characters and bad targets", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    expect((await meNickname(me, "pt", "đ".repeat(30))).status).toBe(200);
    expect((await meNickname(me, "pt", "👍".repeat(30))).status).toBe(200);

    for (const [target, nickname] of [
      ["pt", "a".repeat(31)],
      ["pt", "a\u0007b"],
      ["user:1", "x"],
      ["admin:0", "x"],
      ["admin:1234567890", "x"],
      ["admin", "x"],
      ["PT", "x"],
      ["", "x"],
    ]) {
      const response = await meNickname(me, target, nickname);

      expect(response.status, `${target} / ${nickname}`).toBe(400);
    }
    expect(
      (
        await callWith(
          app,
          "put",
          "/v1/chat/conversations/me/nickname",
          me.token,
          { body: { target: "pt" } },
        )
      ).status,
    ).toBe(400);
    expect((await stored(conversationId)).map((row) => row.nickname)).toEqual([
      "👍".repeat(30),
    ]);
  });

  it("needs a session, and the admin route needs an admin", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);
    const path = `/v1/chat/conversations/${conversationId}/nickname`;
    const body = { target: "pt", nickname: "x" };

    expect(
      (
        await callWith(app, "put", "/v1/chat/conversations/me/nickname", null, {
          body,
        })
      ).status,
    ).toBe(401);
    expect((await callWith(app, "put", path, null, { body })).status).toBe(401);
    // A trainee never reaches the admin route, not even for their own chat.
    expect((await callWith(app, "put", path, me.token, { body })).status).toBe(
      403,
    );
    // An admin has no "my conversation".
    expect(
      (
        await callWith(app, "put", "/v1/chat/conversations/me/nickname", pt.token, {
          body,
        })
      ).status,
    ).toBe(403);
    expect(await stored(conversationId)).toEqual([]);
  });

  it("answers not found to a PT outside the trainee's workspace, and to a missing conversation", async () => {
    const owner = await admin("pt");
    const stranger = await admin("pt");
    const { conversationId } = await pair(owner);

    const outside = await ptNickname(stranger, conversationId, "user", "x");

    expect(outside.status).toBe(404);
    expect(outside.body.code).toBe("CONVERSATION_NOT_FOUND");
    expect(
      (await ptNickname(owner, conversationId + 1000, "user", "x")).status,
    ).toBe(404);
    expect(await stored(conversationId)).toEqual([]);
    // A super admin works with every conversation.
    const boss = await admin("super_admin");

    expect(
      (await ptNickname(boss, conversationId, "user", "Sếp đặt")).status,
    ).toBe(200);
  });

  it("only lets an admin target be one who may work with the trainee", async () => {
    const owner = await admin("pt");
    const other = await admin("pt");
    const boss = await admin("super_admin");
    const { me, conversationId } = await pair(owner);

    // The owner PT and a super admin belong to the conversation.
    for (const member of [owner, boss]) {
      expect(
        (await meNickname(me, `admin:${member.id}`, `Tên ${member.id}`)).status,
      ).toBe(200);
    }
    // Another PT's workspace and an account that does not exist do not.
    for (const id of [other.id, 999999]) {
      const response = await meNickname(me, `admin:${id}`, "Lạ");

      expect(response.status, `admin:${id}`).toBe(404);
      expect(response.body.code).toBe("ADMIN_NOT_FOUND");
      expect(
        (await ptNickname(owner, conversationId, `admin:${id}`, "Lạ")).status,
      ).toBe(404);
    }
    expect((await stored(conversationId)).map((row) => row.targetKey)).toEqual(
      [`admin:${owner.id}`, `admin:${boss.id}`].sort(),
    );
  });

  it("is read-only while the chat is locked, like sending", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    await meNickname(me, "pt", "Thầy");
    await enableChat(ds, me.id, false);

    for (const response of [
      await meNickname(me, "pt", "Mới"),
      await meNickname(me, "pt", ""),
      await ptNickname(pt, conversationId, "user", "Mới"),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CHAT_LOCKED");
    }
    expect(await stored(conversationId)).toEqual([
      { targetKey: "pt", nickname: "Thầy", setByKey: "user" },
    ]);
    // Reading stays allowed and still shows them.
    const thread = await callWith(
      app,
      "get",
      "/v1/chat/conversations/me/messages",
      me.token,
    );

    expect(thread.body.profile.nicknames).toEqual({ pt: "Thầy" });
  });

  it("gives a trainee whose chat was never opened a locked answer, not a new conversation", async () => {
    const pt = await admin("pt");
    const closed = await trainee({ ptAdminId: pt.id, chat: false });

    expect((await meNickname(closed, "pt", "x")).body.code).toBe("CHAT_LOCKED");
    expect(
      await ds.query(`SELECT 1 FROM chat_conversations WHERE user_id = $1`, [
        closed.id,
      ]),
    ).toEqual([]);
  });

  it("creates the conversation of a trainee whose chat is on but has none yet", async () => {
    const pt = await admin("pt");
    const fresh = await trainee({ ptAdminId: pt.id });

    expect((await meNickname(fresh, "pt", "Thầy")).status).toBe(200);
    expect(
      await ds.query(`SELECT 1 FROM chat_conversations WHERE user_id = $1`, [
        fresh.id,
      ]),
    ).toHaveLength(1);
  });

  it("answers the hidden-trainee rule like every other conversation route", async () => {
    const pt = await seedAdmin(ds, { role: "pt", passcode: "1234" });
    const token = await tokenOf(app, { kind: "admin", ...pt });
    const me = await seedUser(ds, { ptAdminId: pt.id });

    await enableChat(ds, me.id);
    const conversationId = await ensureConversation(ds, me.id);

    await ds.query(
      `INSERT INTO admin_hidden_users (admin_id, user_id) VALUES ($1, $2)`,
      [pt.id, me.id],
    );
    // Unlocked with the passcode, but the trainee stays hidden until revealed.
    await callWith(app, "post", "/v1/admins/me/passcode/verify", token, {
      body: { passcode: "1234" },
    });
    const response = await callWith(
      app,
      "put",
      `/v1/chat/conversations/${conversationId}/nickname`,
      token,
      { body: { target: "user", nickname: "x" } },
    );

    expect(response.status).toBe(404);
  });
});

describe("what the nicknames show", () => {
  it("names the trainee in the hidden list and the bubbles, and the PT in the trainee's bubble", async () => {
    const pt = await admin("pt");
    const { me, conversationId } = await pair(pt);

    await callWith(app, "post", `/v1/chat/trainees/${me.id}/messages`, pt.token, {
      body: { body: "chào" },
      headers: { "Idempotency-Key": newKey() },
    });
    await ptNickname(pt, conversationId, "user", "Bé Na");

    const adminBubbles = await callWith(
      app,
      "get",
      `/v1/chat/bubbles?ids=${me.id}`,
      pt.token,
    );

    expect(adminBubbles.body.bubbles[0].name).toBe("Bé Na");

    // The trainee's bubble names the PT: their nickname, else the PT side's,
    // else the real name.
    const bubble = async () =>
      (await callWith(app, "get", "/v1/chat/bubbles", me.token)).body
        .bubbles[0].name;

    expect(await bubble()).toBe(pt.username);
    await meNickname(me, "pt", "Thầy");
    expect(await bubble()).toBe("Thầy");
    await ptNickname(pt, conversationId, `admin:${pt.id}`, "HLV");
    expect(await bubble()).toBe("HLV");
  });
});

describe("removing members", () => {
  it("clears the nickname of a removed admin and keeps what that admin set for others", async () => {
    const owner = await admin("pt");
    const leaving = await admin("super_admin");
    const { me, conversationId } = await pair(owner);

    await ptNickname(leaving, conversationId, "user", "Bé Na");
    await meNickname(me, `admin:${leaving.id}`, "Sếp");
    await meNickname(me, `admin:${owner.id}`, "Coach");
    expect(await stored(conversationId)).toHaveLength(3);

    await ds.query(`DELETE FROM admins WHERE id = $1`, [leaving.id]);

    // The row about the removed admin went with them; the trainee's nickname,
    // typed by that admin, stays with its (now dangling) setter key.
    expect(await stored(conversationId)).toEqual([
      { targetKey: `admin:${owner.id}`, nickname: "Coach", setByKey: "user" },
      {
        targetKey: "user",
        nickname: "Bé Na",
        setByKey: `admin:${leaving.id}`,
      },
    ]);
  });

  it("clears every nickname of a conversation with the conversation", async () => {
    const owner = await admin("pt");
    const { me, conversationId } = await pair(owner);
    const other = await pair(owner);

    await meNickname(me, "pt", "Thầy");
    await meNickname(other.me, "pt", "Khác");
    await ds.query(`DELETE FROM chat_conversations WHERE id = $1`, [
      conversationId,
    ]);

    expect(await stored(conversationId)).toEqual([]);
    expect(await stored(other.conversationId)).toHaveLength(1);
  });
});
