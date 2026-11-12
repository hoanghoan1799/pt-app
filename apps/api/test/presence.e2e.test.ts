import type { INestApplication } from "@nestjs/common";
import { UNLOCK_WINDOW_SECONDS } from "@pt/contracts";
import type { DataSource } from "typeorm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { Clock } from "../src/common/clock.js";
import { createTestApp } from "./support/app.js";
import { FakeClock, seedAdmin, seedUser, tokenOf } from "./support/auth.js";
import { callWith, enableChat, ensureConversation } from "./support/chat.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import {
  connectClient,
  listenOnRandomPort,
  pause,
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

afterEach(async () => {
  for (const client of open.splice(0)) {
    client.close();
  }
  // Let the server finish handling the disconnects before the next test.
  await pause(200);
});

// Every test starts with nobody seen, so the PT team reads only what it did.
beforeEach(async () => {
  await ds.query(`UPDATE admins SET last_seen_at = NULL`);
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

const trainee = async (ptAdminId: number | null = null) => {
  const row = await seedUser(ds, { ptAdminId });

  await enableChat(ds, row.id);
  return { ...row, token: await tokenOf(app, { kind: "user", ...row }) };
};

const admin = async (passcode?: string) => {
  const row = await seedAdmin(ds, { role: "pt", passcode });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

const connect = async (token: string) => {
  const client = await connectClient(url, { token });

  open.push(client);
  return client;
};

const floorSeconds = (date: Date) =>
  new Date(Math.floor(date.getTime() / 1000) * 1000);

const peer = (token: string, query = "") =>
  callWith(app, "get", `/v1/presence/peer${query}`, token);

const lastSeen = async (table: "users" | "admins", id: number) =>
  (
    (await ds.query(`SELECT last_seen_at AS at FROM ${table} WHERE id = $1`, [
      id,
    ])) as { at: Date | null }[]
  )[0].at;

describe("a trainee's presence, seen by their PT", () => {
  it("tells the PT when the trainee connects and when the last socket closes", async () => {
    const pt = await admin();
    const me = await trainee(pt.id);
    const conversationId = await ensureConversation(ds, me.id);
    const ptSocket = await connect(pt.token);

    await ptSocket.ask("subscribe", { conversationId });
    const first = await connect(me.token);
    const stamp = floorSeconds(clock.now()).toISOString();

    expect(await ptSocket.waitFor("presence")).toEqual({
      role: "user",
      userId: me.id,
      online: true,
      lastSeenAt: stamp,
    });
    // A second tab changes nothing.
    const second = await connect(me.token);

    await pause(200);
    expect(ptSocket.named("presence")).toHaveLength(1);

    clock.advance(30_000);
    first.close();
    await pause(200);
    expect(ptSocket.named("presence")).toHaveLength(1);
    second.close();
    expect(
      await ptSocket.waitFor("presence", (data) => data.online === false),
    ).toEqual({
      role: "user",
      userId: me.id,
      online: false,
      lastSeenAt: floorSeconds(clock.now()).toISOString(),
    });
    expect(await lastSeen("users", me.id)).toEqual(floorSeconds(clock.now()));
  });

  it("answers the polling fallback: online with a live socket, online for two minutes after a beat, then offline", async () => {
    const pt = await admin();
    const me = await trainee(pt.id);
    const socket = await connect(me.token);

    const live = await peer(pt.token, `?userId=${me.id}`);

    expect(live.status).toBe(200);
    expect(live.body).toEqual({
      peerLastSeenAt: floorSeconds(clock.now()).toISOString(),
      serverNow: clock.now().toISOString(),
      peerOnline: true,
    });
    const closed = socket.disconnected();

    socket.close();
    await closed;
    await pause(150);
    expect((await peer(pt.token, `?userId=${me.id}`)).body.peerOnline).toBe(
      true,
    );
    clock.advance(121_000);
    const gone = await peer(pt.token, `?userId=${me.id}`);

    expect(gone.body.peerOnline).toBe(false);
    expect(gone.body.peerLastSeenAt).toBe(
      floorSeconds(new Date(clock.now().getTime() - 121_000)).toISOString(),
    );
  });

  it("is 404 for a PT outside the workspace, 400 without a userId, and null for a trainee never seen", async () => {
    const pt = await admin();
    const stranger = await admin();
    const me = await trainee(pt.id);

    expect((await peer(stranger.token, `?userId=${me.id}`)).status).toBe(404);
    expect((await peer(pt.token, "?userId=999999")).status).toBe(404);
    expect((await peer(pt.token)).status).toBe(400);
    const unseen = await peer(pt.token, `?userId=${me.id}`);

    expect(unseen.body).toMatchObject({
      peerLastSeenAt: null,
      peerOnline: false,
    });
    expect((await peer("", "")).status).toBe(401);
  });
});

describe("the PT team's presence, seen by trainees", () => {
  it("tells connected trainees when the team comes online, and honours presence_hidden", async () => {
    const pt = await admin();
    const me = await trainee(pt.id);
    const mine = await connect(me.token);

    expect((await peer(me.token)).body).toMatchObject({
      peerLastSeenAt: null,
      peerOnline: false,
    });
    const ptSocket = await connect(pt.token);

    expect(await mine.waitFor("presence")).toEqual({
      role: "admin",
      userId: null,
      online: true,
      lastSeenAt: floorSeconds(clock.now()).toISOString(),
    });
    expect((await peer(me.token)).body.peerOnline).toBe(true);

    // "Trạng thái hoạt động" off: the team reads offline, no last seen.
    const hide = await callWith(
      app,
      "put",
      "/v1/admins/me/presence-hidden",
      pt.token,
      {
        body: { isHidden: true },
      },
    );

    expect(hide.status).toBe(200);
    expect(
      await mine.waitFor("presence", (data) => data.online === false),
    ).toEqual({ role: "admin", userId: null, online: false, lastSeenAt: null });
    expect((await peer(me.token)).body).toMatchObject({
      peerLastSeenAt: null,
      peerOnline: false,
    });

    await callWith(app, "put", "/v1/admins/me/presence-hidden", pt.token, {
      body: { isHidden: false },
    });
    expect(
      await mine.waitFor(
        "presence",
        () =>
          mine.named("presence").filter((data) => data.online === true)
            .length >= 2,
      ),
    ).toMatchObject({ role: "admin", online: true });

    const closed = mine.disconnected();

    ptSocket.close();
    expect(
      await mine.waitFor(
        "presence",
        (data) => data.online === false && data.lastSeenAt !== null,
      ),
    ).toMatchObject({ role: "admin", userId: null, online: false });
    mine.close();
    await closed;
  });

  it("never lets a hidden PT's connection show to trainees", async () => {
    const pt = await admin();
    const me = await trainee(pt.id);

    await callWith(app, "put", "/v1/admins/me/presence-hidden", pt.token, {
      body: { isHidden: true },
    });
    const mine = await connect(me.token);

    await connect(pt.token);
    await pause(300);
    expect(mine.named("presence").every((data) => data.online === false)).toBe(
      true,
    );
    const view = await peer(me.token);

    expect(view.body.peerOnline).toBe(false);
  });
});

describe("the heartbeat", () => {
  const unlockedUntil = async (adminId: number) =>
    (
      (await ds.query(
        `SELECT unlocked_until AS at FROM sessions WHERE admin_id = $1`,
        [adminId],
      )) as { at: Date | null }[]
    )[0].at;

  it("extends an unlocked admin's window, over REST and over the socket", async () => {
    const pt = await admin("1234");

    await callWith(app, "post", "/v1/admins/me/passcode/verify", pt.token, {
      body: { passcode: "1234" },
    });
    const first = await unlockedUntil(pt.id);

    expect(first).toEqual(
      new Date(clock.now().getTime() + UNLOCK_WINDOW_SECONDS * 1000),
    );
    clock.advance(120_000);
    const beat = await callWith(
      app,
      "post",
      "/v1/presence/heartbeat",
      pt.token,
    );

    expect(beat.status).toBe(204);
    const second = await unlockedUntil(pt.id);

    expect(second).toEqual(
      new Date(clock.now().getTime() + UNLOCK_WINDOW_SECONDS * 1000),
    );
    expect(second!.getTime()).toBeGreaterThan(first!.getTime());
    expect(await lastSeen("admins", pt.id)).toEqual(floorSeconds(clock.now()));

    const socket = await connect(pt.token);

    clock.advance(90_000);
    expect(await socket.ask("heartbeat")).toEqual({ ok: true });
    expect(await unlockedUntil(pt.id)).toEqual(
      new Date(clock.now().getTime() + UNLOCK_WINDOW_SECONDS * 1000),
    );
  });

  it("never unlocks a locked session and is refused for a locked admin", async () => {
    const pt = await admin("1234");

    const beat = await callWith(
      app,
      "post",
      "/v1/presence/heartbeat",
      pt.token,
    );

    expect(beat.status).toBe(403);
    expect(beat.body).toMatchObject({ code: "ADMIN_LOCKED" });
    expect(await unlockedUntil(pt.id)).toBeNull();
    expect(await lastSeen("admins", pt.id)).toBeNull();
  });

  it("writes last_seen_at at most once a minute for a trainee", async () => {
    const me = await trainee();
    const beat = () =>
      callWith(app, "post", "/v1/presence/heartbeat", me.token);

    expect((await beat()).status).toBe(204);
    const first = await lastSeen("users", me.id);

    expect(first).toEqual(floorSeconds(clock.now()));
    clock.advance(20_000);
    await beat();
    expect(await lastSeen("users", me.id)).toEqual(first);
    clock.advance(40_000);
    await beat();
    expect(await lastSeen("users", me.id)).toEqual(floorSeconds(clock.now()));
    expect(
      (await callWith(app, "post", "/v1/presence/heartbeat", null)).status,
    ).toBe(401);
  });

  it("does not slide the unlock of an admin without a passcode", async () => {
    const pt = await admin();

    expect(
      (await callWith(app, "post", "/v1/presence/heartbeat", pt.token)).status,
    ).toBe(204);
    expect(await unlockedUntil(pt.id)).toBeNull();
    expect(await lastSeen("admins", pt.id)).toEqual(floorSeconds(clock.now()));
  });
});
