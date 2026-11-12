import type { INestApplication } from "@nestjs/common";
import { Controller, Get, Param, Put, Req } from "@nestjs/common";
import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  Admin,
  type AuthedRequest,
  Public,
  Roles,
  ScopedToTrainee,
  User,
} from "../src/auth/decorators/index.js";
import { SessionsService } from "../src/auth/sessions.service.js";
import { Clock } from "../src/common/clock.js";
import { createTestApp } from "./support/app.js";
import {
  bearer,
  FakeClock,
  hideTrainee,
  MINUTE,
  seedAdmin,
  seedConversation,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

// Routes that exercise every guard in the chain.
@Controller("probe")
class ProbeController {
  @Get("public")
  @Public()
  open() {
    return { ok: true };
  }

  @Get("session")
  anySession() {
    return { ok: true };
  }

  @Get("admin")
  @Admin()
  anyAdmin() {
    return { ok: true };
  }

  @Get("super")
  @Roles("super_admin")
  superOnly() {
    return { ok: true };
  }

  @Get("pt")
  @Roles("pt")
  ptOnly() {
    return { ok: true };
  }

  @Get("trainee")
  @User()
  traineeOnly() {
    return { ok: true };
  }

  @Get("trainees/:userId")
  @Admin()
  @ScopedToTrainee()
  trainee(@Param("userId") userId: string, @Req() req: AuthedRequest) {
    return { userId: Number(userId), scoped: req.scopedUserId };
  }

  // Hide / unhide: only the scope applies.
  @Put("trainees/:userId/hidden")
  @Admin()
  @ScopedToTrainee({ ignoreHidden: true })
  hide() {
    return { ok: true };
  }

  @Get("conversations/:cid")
  @Admin()
  @ScopedToTrainee({ param: "cid", source: "conversation" })
  conversation(@Req() req: AuthedRequest) {
    return { scoped: req.scopedUserId };
  }
}

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let clock: FakeClock;

const get = (path: string, token?: string) => {
  const call = request(app.getHttpServer()).get(path);

  return token ? call.set(bearer(token)) : call;
};

const post = (path: string, token: string, body: object = {}) =>
  request(app.getHttpServer()).post(path).set(bearer(token)).send(body);

type Tokens = {
  superAdmin: string;
  ptA: string;
  ptB: string;
  trainee: string;
  lockedPt: string;
};

const ids = {} as {
  ptA: number;
  ptB: number;
  superAdmin: number;
  mine: number;
  theirs: number;
  unassigned: number;
  mineConversation: number;
  theirConversation: number;
};
let tokens: Tokens;

// A PT with a passcode, unlocked and revealing hidden trainees.
const reveal = async (admin: { token: string }, code: string) => {
  await post("/v1/admins/me/passcode/verify", admin.token, { passcode: code });
  const response = await post(
    "/v1/admins/me/hidden-users/reveal",
    admin.token,
    {
      passcode: code,
    },
  );

  expect(response.body.revealed).toBe(true);
};

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  clock = new FakeClock();
  app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    controllers: [ProbeController],
    overrideProviders: [{ token: Clock, value: clock }],
  });

  const superAdmin = await seedAdmin(ds, { role: "super_admin" });
  const ptA = await seedAdmin(ds, { role: "pt", passcode: "1111" });
  const ptB = await seedAdmin(ds, { role: "pt", passcode: "2222" });
  const lockedPt = await seedAdmin(ds, { role: "pt", passcode: "3333" });
  const mine = await seedUser(ds, { ptAdminId: ptA.id });
  const theirs = await seedUser(ds, { ptAdminId: ptB.id });
  const unassigned = await seedUser(ds, { ptAdminId: null });

  Object.assign(ids, {
    ptA: ptA.id,
    ptB: ptB.id,
    superAdmin: superAdmin.id,
    mine: mine.id,
    theirs: theirs.id,
    unassigned: unassigned.id,
    mineConversation: await seedConversation(ds, mine.id),
    theirConversation: await seedConversation(ds, theirs.id),
  });

  tokens = {
    superAdmin: await tokenOf(app, { kind: "admin", ...superAdmin }),
    ptA: await tokenOf(app, { kind: "admin", ...ptA }),
    ptB: await tokenOf(app, { kind: "admin", ...ptB }),
    lockedPt: await tokenOf(app, { kind: "admin", ...lockedPt }),
    trainee: await tokenOf(app, { kind: "user", ...mine }),
  };
  // Unlock the two PTs that work with passcodes (the lock is per session).
  await post("/v1/admins/me/passcode/verify", tokens.ptA, { passcode: "1111" });
  await post("/v1/admins/me/passcode/verify", tokens.ptB, { passcode: "2222" });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe("role guard matrix", () => {
  const routes = [
    { path: "/v1/probe/public", allowed: ["anon", "super", "pt", "trainee"] },
    { path: "/v1/probe/session", allowed: ["super", "pt", "trainee"] },
    { path: "/v1/probe/admin", allowed: ["super", "pt"] },
    { path: "/v1/probe/super", allowed: ["super"] },
    { path: "/v1/probe/pt", allowed: ["pt"] },
    { path: "/v1/probe/trainee", allowed: ["trainee"] },
  ];

  for (const route of routes) {
    it(`${route.path} -> ${route.allowed.join(", ")}`, async () => {
      const callers = {
        anon: undefined,
        super: tokens.superAdmin,
        pt: tokens.ptA,
        trainee: tokens.trainee,
      };

      for (const [who, token] of Object.entries(callers)) {
        const response = await get(route.path, token);
        const allowed = route.allowed.includes(who);

        if (allowed) {
          expect(response.status, `${who} on ${route.path}`).toBe(200);
        } else if (who === "anon") {
          expect(response.status).toBe(401);
          expect(response.body.code).toBe("SESSION_INVALID");
        } else {
          expect(response.status, `${who} on ${route.path}`).toBe(403);
          expect(response.body.code).toBe("FORBIDDEN");
        }
      }
    });
  }

  it("stops a passcode-locked admin everywhere except the lock-exempt routes", async () => {
    for (const path of [
      "/v1/probe/session",
      "/v1/probe/admin",
      "/v1/probe/pt",
    ]) {
      const response = await get(path, tokens.lockedPt);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("ADMIN_LOCKED");
    }
    expect((await get("/v1/auth/me", tokens.lockedPt)).status).toBe(200);
    // A wrong role still answers FORBIDDEN, not ADMIN_LOCKED.
    expect((await get("/v1/probe/super", tokens.lockedPt)).body.code).toBe(
      "FORBIDDEN",
    );
  });

  it("never lets a locked admin through the scope guard", async () => {
    const response = await get(
      `/v1/probe/trainees/${ids.mine}`,
      tokens.lockedPt,
    );

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ADMIN_LOCKED");
  });
});

describe("PT workspace scope", () => {
  it("lets a PT reach their own trainees and conversations only", async () => {
    const own = await get(`/v1/probe/trainees/${ids.mine}`, tokens.ptA);
    const other = await get(`/v1/probe/trainees/${ids.theirs}`, tokens.ptA);
    const loose = await get(`/v1/probe/trainees/${ids.unassigned}`, tokens.ptA);

    expect(own.status).toBe(200);
    expect(own.body).toEqual({ userId: ids.mine, scoped: ids.mine });
    expect(other.status).toBe(404);
    expect(other.body.code).toBe("TRAINEE_NOT_FOUND");
    // An unassigned trainee belongs to no PT.
    expect(loose.status).toBe(404);

    expect(
      (await get(`/v1/probe/conversations/${ids.mineConversation}`, tokens.ptA))
        .body,
    ).toEqual({ scoped: ids.mine });
    expect(
      (
        await get(
          `/v1/probe/conversations/${ids.theirConversation}`,
          tokens.ptA,
        )
      ).status,
    ).toBe(404);
    // And the other way round.
    expect(
      (await get(`/v1/probe/trainees/${ids.mine}`, tokens.ptB)).status,
    ).toBe(404);
    expect(
      (await get(`/v1/probe/trainees/${ids.theirs}`, tokens.ptB)).status,
    ).toBe(200);
  });

  it("answers a missing trainee and a foreign one with the same body", async () => {
    const foreign = await get(`/v1/probe/trainees/${ids.theirs}`, tokens.ptA);
    const missing = await get("/v1/probe/trainees/999999", tokens.ptA);

    expect(foreign.status).toBe(missing.status);
    expect({ ...foreign.body, ref: "x" }).toEqual({
      ...missing.body,
      ref: "x",
    });
  });

  it("treats malformed ids as not found", async () => {
    for (const bad of ["abc", "-1", "0", "1e3", "1.5", "99999999999999"]) {
      expect((await get(`/v1/probe/trainees/${bad}`, tokens.ptA)).status).toBe(
        404,
      );
    }
    expect(
      (await get("/v1/probe/conversations/777777", tokens.ptA)).status,
    ).toBe(404);
  });

  it("gives a super admin every trainee, assigned or not", async () => {
    for (const id of [ids.mine, ids.theirs, ids.unassigned]) {
      expect(
        (await get(`/v1/probe/trainees/${id}`, tokens.superAdmin)).status,
      ).toBe(200);
    }
    expect(
      (
        await get(
          `/v1/probe/conversations/${ids.theirConversation}`,
          tokens.superAdmin,
        )
      ).status,
    ).toBe(200);
    expect(
      (await get("/v1/probe/trainees/999999", tokens.superAdmin)).status,
    ).toBe(404);
  });

  it("refuses a trainee on a scoped admin route", async () => {
    const response = await get(
      `/v1/probe/trainees/${ids.mine}`,
      tokens.trainee,
    );

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });
});

describe("hidden trainees", () => {
  it("are invisible to the admin who hid them until that admin reveals, then again after 10 minutes", async () => {
    await hideTrainee(ds, ids.ptA, ids.mine);

    const hidden = await get(`/v1/probe/trainees/${ids.mine}`, tokens.ptA);
    const missing = await get("/v1/probe/trainees/999999", tokens.ptA);

    expect(hidden.status).toBe(404);
    expect({ ...hidden.body, ref: "x" }).toEqual({ ...missing.body, ref: "x" });
    expect(
      (await get(`/v1/probe/conversations/${ids.mineConversation}`, tokens.ptA))
        .status,
    ).toBe(404);

    await reveal({ token: tokens.ptA }, "1111");
    expect(
      (await get(`/v1/probe/trainees/${ids.mine}`, tokens.ptA)).status,
    ).toBe(200);
    expect(
      (await get(`/v1/probe/conversations/${ids.mineConversation}`, tokens.ptA))
        .status,
    ).toBe(200);

    // A reveal never widens the workspace.
    expect(
      (await get(`/v1/probe/trainees/${ids.theirs}`, tokens.ptA)).status,
    ).toBe(404);

    // The reveal is a fixed 10 minutes. The presence heartbeat keeps the unlock
    // alive (a sliding 5 minutes) but never extends the reveal.
    const sessionId = (await get("/v1/auth/me", tokens.ptA)).body.session.id;
    const sessions = app.get(SessionsService);

    for (const step of [4, 4]) {
      clock.advance(step * MINUTE);
      await sessions.extendUnlock(sessionId);
    }
    expect(
      (await get(`/v1/probe/trainees/${ids.mine}`, tokens.ptA)).status,
    ).toBe(200);

    clock.advance(3 * MINUTE);
    await sessions.extendUnlock(sessionId);
    expect(
      (await get(`/v1/probe/trainees/${ids.mine}`, tokens.ptA)).status,
    ).toBe(404);
  });

  it("is per admin: another admin's hiding changes nothing for me", async () => {
    // ptA hid `mine` above; the super admin and ptB are unaffected.
    expect(
      (await get(`/v1/probe/trainees/${ids.mine}`, tokens.superAdmin)).status,
    ).toBe(200);

    // Time has moved on: unlock the PTs again.
    await post("/v1/admins/me/passcode/verify", tokens.ptB, {
      passcode: "2222",
    });
    await hideTrainee(ds, ids.ptB, ids.theirs);
    expect(
      (await get(`/v1/probe/trainees/${ids.theirs}`, tokens.ptB)).status,
    ).toBe(404);
    expect(
      (await get(`/v1/probe/trainees/${ids.theirs}`, tokens.superAdmin)).status,
    ).toBe(200);
  });

  it("also hide from a super admin who hid them", async () => {
    const superAdmin = await seedAdmin(ds, {
      role: "super_admin",
      passcode: "5555",
    });
    const token = await tokenOf(app, { kind: "admin", ...superAdmin });

    await post("/v1/admins/me/passcode/verify", token, { passcode: "5555" });
    await hideTrainee(ds, superAdmin.id, ids.unassigned);
    expect(
      (await get(`/v1/probe/trainees/${ids.unassigned}`, token)).status,
    ).toBe(404);

    await reveal({ token }, "5555");
    expect(
      (await get(`/v1/probe/trainees/${ids.unassigned}`, token)).status,
    ).toBe(200);
  });

  it("need no reveal for the hide / unhide route, but the workspace still applies", async () => {
    const put = (id: number, token: string) =>
      request(app.getHttpServer())
        .put(`/v1/probe/trainees/${id}/hidden`)
        .set(bearer(token));

    await post("/v1/admins/me/passcode/verify", tokens.ptA, {
      passcode: "1111",
    });
    await post("/v1/admins/me/passcode/verify", tokens.ptB, {
      passcode: "2222",
    });
    // `theirs` is hidden by ptB and ptB has not revealed: still reachable here.
    expect((await put(ids.theirs, tokens.ptB)).status).toBe(200);
    expect((await put(ids.theirs, tokens.ptA)).status).toBe(404);
  });

  it("do not carry over to another session of the same admin", async () => {
    const admin = await seedAdmin(ds, { role: "pt", passcode: "6666" });
    const mineToo = await seedUser(ds, { ptAdminId: admin.id });
    const first = await tokenOf(app, { kind: "admin", ...admin });
    const second = await tokenOf(app, { kind: "admin", ...admin });

    await hideTrainee(ds, admin.id, mineToo.id);
    await reveal({ token: first }, "6666");
    await post("/v1/admins/me/passcode/verify", second, { passcode: "6666" });

    expect((await get(`/v1/probe/trainees/${mineToo.id}`, first)).status).toBe(
      200,
    );
    expect((await get(`/v1/probe/trainees/${mineToo.id}`, second)).status).toBe(
      404,
    );
  });

  it("end when the admin locks", async () => {
    const admin = await seedAdmin(ds, { role: "pt", passcode: "7777" });
    const trainee = await seedUser(ds, { ptAdminId: admin.id });
    const token = await tokenOf(app, { kind: "admin", ...admin });

    await hideTrainee(ds, admin.id, trainee.id);
    await reveal({ token }, "7777");
    expect((await get(`/v1/probe/trainees/${trainee.id}`, token)).status).toBe(
      200,
    );

    await post("/v1/admins/me/passcode/lock", token);
    expect((await get(`/v1/probe/trainees/${trainee.id}`, token)).status).toBe(
      403,
    );

    await post("/v1/admins/me/passcode/verify", token, { passcode: "7777" });
    expect((await get(`/v1/probe/trainees/${trainee.id}`, token)).status).toBe(
      404,
    );
  });
});
