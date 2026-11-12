import { createHash } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { AUTH_MESSAGES } from "@pt/contracts";
import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { LoginAttempt } from "../src/database/entities/login-attempt.entity.js";
import { Session } from "../src/database/entities/session.entity.js";
import { createTestApp } from "./support/app.js";
import {
  bearer,
  DAY,
  FakeClock,
  loginAdmin,
  loginUser,
  MINUTE,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let clock: FakeClock;

const get = (path: string, token?: string) => {
  const call = request(app.getHttpServer()).get(path);

  return token ? call.set(bearer(token)) : call;
};

const post = (path: string, token?: string, body: object = {}) => {
  const call = request(app.getHttpServer()).post(path).send(body);

  return token ? call.set(bearer(token)) : call;
};

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  clock = new FakeClock();
  app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: Clock, value: clock }],
  });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe("user login", () => {
  it("returns an opaque token once and stores only its SHA-256 hash", async () => {
    const user = await seedUser(ds, { email: "An.Nguyen@Example.com" });
    const response = await loginUser(
      app,
      { email: "  an.nguyen@example.COM ", password: user.password },
      { clientKind: "ios", clientName: "An's iPhone" },
    );

    expect(response.status).toBe(200);
    expect(response.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body).toMatchObject({
      role: "trainee",
      actor: { kind: "user", id: user.id, name: user.name },
      session: { clientKind: "ios", clientName: "An's iPhone", current: true },
    });

    const row = await ds.getRepository(Session).findOneByOrFail({
      id: response.body.session.id,
    });

    expect(
      row.tokenHash.equals(
        createHash("sha256").update(response.body.token).digest(),
      ),
    ).toBe(true);
    expect(row.subjectKind).toBe("user");
    expect(row.userId).toBe(user.id);
    expect(JSON.stringify(row)).not.toContain(response.body.token);
    expect(row.expiresAt.getTime() - clock.now().getTime()).toBe(400 * DAY);
  });

  it("never exposes hashes, passcode state internals or extra columns", async () => {
    const user = await seedUser(ds);
    const response = await loginUser(app, user);
    const raw = JSON.stringify(response.body);

    expect(Object.keys(response.body).sort()).toEqual([
      "actor",
      "role",
      "session",
      "token",
    ]);
    // chatEnabled, termsVersion, preferredMealCount and foodNote let the web
    // drop its own users read (step 9b-C); still no secrets.
    expect(Object.keys(response.body.actor).sort()).toEqual([
      "chatEnabled",
      "email",
      "foodNote",
      "id",
      "kind",
      "locale",
      "name",
      "preferredMealCount",
      "ptAdminId",
      "termsVersion",
    ]);
    for (const leak of ["passwordHash", "scrypt$", "tokenHash", "userAgent"]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("rejects a wrong password, an unknown email, a malformed email and a trainee without a password with one message", async () => {
    const user = await seedUser(ds);
    const noPassword = await seedUser(ds, { password: null });
    const attempts = [
      { email: user.email, password: "wrong-password" },
      { email: "nobody@example.com", password: "whatever-1" },
      { email: "not-an-email", password: "whatever-1" },
      { email: noPassword.email, password: "anything-1" },
    ];

    for (const credentials of attempts) {
      const response = await loginUser(app, credentials);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: AUTH_MESSAGES.EMAIL_LOGIN_WRONG,
      });
    }
  });

  it("counts a malformed email on the limiter like any other failure", async () => {
    await loginUser(app, { email: "broken-address", password: "x1234567" });
    const row = await ds
      .getRepository(LoginAttempt)
      .findOneByOrFail({ key: "user:broken-address" });

    expect(row.failedCount).toBe(1);
  });

  it("validates the body: empty fields and unknown client kinds are 400", async () => {
    const empty = await loginUser(app, { email: "", password: "" });
    const kind = await loginUser(
      app,
      { email: "a@b.co", password: "x" },
      { clientKind: "toaster" },
    );

    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe("VALIDATION_FAILED");
    expect(kind.status).toBe(400);
  });

  it("does not let an admin sign in on the trainee route or the other way round", async () => {
    const admin = await seedAdmin(ds, { username: "cross.admin" });
    const user = await seedUser(ds);

    expect(
      (await loginUser(app, { email: "cross.admin", password: admin.password }))
        .status,
    ).toBe(401);
    expect(
      (await loginAdmin(app, { username: user.email, password: user.password }))
        .status,
    ).toBe(401);
  });
});

describe("admin login", () => {
  it("signs in by username (case-insensitive) and maps the null role to super_admin", async () => {
    const admin = await seedAdmin(ds, { username: "Coach.Lan", role: null });
    const response = await loginAdmin(app, {
      username: " coach.lan ",
      password: admin.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      role: "super_admin",
      actor: {
        kind: "admin",
        id: admin.id,
        username: "Coach.Lan",
        role: "super_admin",
        hasPasscode: false,
        locked: false,
        unlockedUntil: null,
        revealedUntil: null,
      },
    });

    const row = await ds.getRepository(Session).findOneByOrFail({
      id: response.body.session.id,
    });

    expect(row.subjectKind).toBe("admin");
    expect(row.adminId).toBe(admin.id);
    expect(row.userId).toBeNull();
    // Admin sessions keep the web's 7 days.
    expect(row.expiresAt.getTime() - clock.now().getTime()).toBe(7 * DAY);
  });

  it("starts locked when the admin has a passcode, and never leaks it", async () => {
    const admin = await seedAdmin(ds, { passcode: "4821" });
    const response = await loginAdmin(app, admin);
    const raw = JSON.stringify(response.body);

    expect(response.body.actor).toMatchObject({
      hasPasscode: true,
      locked: true,
    });
    for (const leak of ["passcodeHash", "passwordHash", "scrypt$", "4821"]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("answers a wrong password and an unknown username with the same 401", async () => {
    const admin = await seedAdmin(ds);

    for (const credentials of [
      { username: admin.username, password: "nope-nope-1" },
      { username: "ghost.admin", password: "nope-nope-1" },
    ]) {
      const response = await loginAdmin(app, credentials);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: AUTH_MESSAGES.CREDENTIALS_WRONG,
      });
    }
  });
});

describe("Bearer only", () => {
  it("rejects missing, malformed, unknown and cookie-only credentials", async () => {
    const user = await seedUser(ds);
    const token = await tokenOf(app, { kind: "user", ...user });

    for (const response of [
      await get("/v1/auth/me"),
      await get("/v1/auth/me", "short"),
      await get("/v1/auth/me", "A".repeat(43)),
      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Cookie", `session=${token}; token=${token}`),
      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Authorization", `Basic ${token}`),
      await request(app.getHttpServer()).get(`/v1/auth/me?token=${token}`),
    ]) {
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("SESSION_INVALID");
    }
    expect((await get("/v1/auth/me", token)).status).toBe(200);
  });

  it("returns no Set-Cookie header on login", async () => {
    const user = await seedUser(ds);
    const response = await loginUser(app, user);

    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});

describe("lockout (login_attempts)", () => {
  const failUser = (email: string) =>
    loginUser(app, { email, password: "wrong-password-1" });

  it("locks after 5 failures, even for the right password, and unlocks after 15 minutes", async () => {
    const user = await seedUser(ds);
    const other = await seedUser(ds);

    for (let i = 0; i < 5; i++) {
      expect((await failUser(user.email)).status).toBe(401);
    }

    const locked = await loginUser(app, user);

    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({
      code: "LOGIN_LOCKED",
      message: AUTH_MESSAGES.LOGIN_LOCKED,
    });
    expect(
      (
        await ds.getRepository(LoginAttempt).findOneByOrFail({
          key: `user:${user.email.toLowerCase()}`,
        })
      ).failedCount,
    ).toBe(5);
    // Another account is unaffected.
    expect((await loginUser(app, other)).status).toBe(200);

    clock.advance(14 * MINUTE);
    expect((await loginUser(app, user)).status).toBe(429);

    clock.advance(2 * MINUTE);
    expect((await loginUser(app, user)).status).toBe(200);
    expect(
      await ds.getRepository(LoginAttempt).findOneBy({
        key: `user:${user.email.toLowerCase()}`,
      }),
    ).toBeNull();
  });

  it("starts a new window when the failures are 15 minutes apart", async () => {
    const user = await seedUser(ds);

    await failUser(user.email);
    await failUser(user.email);
    clock.advance(16 * MINUTE);
    await failUser(user.email);

    expect(
      (
        await ds.getRepository(LoginAttempt).findOneByOrFail({
          key: `user:${user.email.toLowerCase()}`,
        })
      ).failedCount,
    ).toBe(1);
  });

  it("clears the counter after a good login", async () => {
    const user = await seedUser(ds);

    await failUser(user.email);
    await failUser(user.email);
    expect((await loginUser(app, user)).status).toBe(200);
    expect(
      await ds.getRepository(LoginAttempt).findOneBy({
        key: `user:${user.email.toLowerCase()}`,
      }),
    ).toBeNull();
  });

  it("counts parallel wrong guesses (no lost updates)", async () => {
    const user = await seedUser(ds);

    await Promise.all(Array.from({ length: 5 }, () => failUser(user.email)));
    expect((await loginUser(app, user)).status).toBe(429);
  });

  it("locks admins the same way, on their own key", async () => {
    const admin = await seedAdmin(ds);

    for (let i = 0; i < 5; i++) {
      await loginAdmin(app, {
        username: admin.username,
        password: "wrong-pw-1",
      });
    }
    expect((await loginAdmin(app, admin)).status).toBe(429);
    expect(
      (
        await ds.getRepository(LoginAttempt).findOneByOrFail({
          key: `admin:${admin.username.toLowerCase()}`,
        })
      ).lockedUntil,
    ).not.toBeNull();

    clock.advance(16 * MINUTE);
    expect((await loginAdmin(app, admin)).status).toBe(200);
  });
});

describe("sessions", () => {
  it("rotates on refresh: the old token dies, the new one works, same session", async () => {
    const user = await seedUser(ds);
    const login = await loginUser(app, user);
    const oldToken = login.body.token as string;

    clock.advance(3 * DAY);

    const refreshed = await post("/v1/auth/refresh", oldToken);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).not.toBe(oldToken);
    expect(refreshed.body.session.id).toBe(login.body.session.id);
    expect(new Date(refreshed.body.session.expiresAt).getTime()).toBe(
      clock.now().getTime() + 400 * DAY,
    );
    expect((await get("/v1/auth/me", oldToken)).status).toBe(401);
    expect((await post("/v1/auth/refresh", oldToken)).status).toBe(401);
    expect((await get("/v1/auth/me", refreshed.body.token)).status).toBe(200);
  });

  it("lets only one of two parallel refreshes with the same token win", async () => {
    const user = await seedUser(ds);
    const token = await tokenOf(app, { kind: "user", ...user });
    const results = await Promise.all([
      post("/v1/auth/refresh", token),
      post("/v1/auth/refresh", token),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("slides a user's expiry only when last use is older than a day", async () => {
    const user = await seedUser(ds);
    const login = await loginUser(app, user);
    const token = login.body.token as string;
    const expiry = (await get("/v1/auth/me", token)).body.session.expiresAt;

    clock.advance(DAY / 2);
    expect((await get("/v1/auth/me", token)).body.session.expiresAt).toBe(
      expiry,
    );

    clock.advance(DAY);

    const slid = await get("/v1/auth/me", token);

    expect(new Date(slid.body.session.expiresAt).getTime()).toBe(
      clock.now().getTime() + 400 * DAY,
    );
  });

  it("does not extend an admin session by use (fixed 7 days like the web)", async () => {
    const admin = await seedAdmin(ds);
    const login = await loginAdmin(app, admin);
    const token = login.body.token as string;

    clock.advance(2 * DAY);

    const me = await get("/v1/auth/me", token);

    expect(me.body.session.expiresAt).toBe(login.body.session.expiresAt);
  });

  it("writes last_seen_at at most once a minute", async () => {
    const user = await seedUser(ds);
    const login = await loginUser(app, user);
    const token = login.body.token as string;
    const id = login.body.session.id as string;
    const seen = async () =>
      (
        await ds.getRepository(Session).findOneByOrFail({ id })
      ).lastSeenAt.getTime();
    const first = await seen();

    clock.advance(30 * 1000);
    await get("/v1/auth/me", token);
    expect(await seen()).toBe(first);

    clock.advance(2 * MINUTE);
    await get("/v1/auth/me", token);
    expect(await seen()).toBe(clock.now().getTime());
  });

  it("answers 401 for an expired session and deletes it", async () => {
    const user = await seedUser(ds);
    const login = await loginUser(app, user);
    const admin = await seedAdmin(ds);
    const adminLogin = await loginAdmin(app, admin);

    clock.advance(8 * DAY);
    expect((await get("/v1/auth/me", adminLogin.body.token)).status).toBe(401);
    // Still inside 400 days for the trainee.
    expect((await get("/v1/auth/me", login.body.token)).status).toBe(200);

    clock.advance(401 * DAY);

    const expired = await get("/v1/auth/me", login.body.token);

    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe("SESSION_INVALID");
    expect(
      await ds.getRepository(Session).findOneBy({ id: login.body.session.id }),
    ).toBeNull();
  });

  it("logs out: 204, the token stops working and the row is gone", async () => {
    const user = await seedUser(ds);
    const login = await loginUser(app, user);
    const out = await post("/v1/auth/logout", login.body.token);

    expect(out.status).toBe(204);
    expect((await get("/v1/auth/me", login.body.token)).status).toBe(401);
    expect(
      await ds.getRepository(Session).findOneBy({ id: login.body.session.id }),
    ).toBeNull();
  });

  it("lists my devices (current flagged, no secrets) and revokes one of them", async () => {
    const user = await seedUser(ds);
    const stranger = await seedUser(ds);
    const phone = await loginUser(app, user, {
      clientKind: "android",
      clientName: "Pixel",
    });

    clock.advance(MINUTE);

    const laptop = await loginUser(app, user, { clientName: "Laptop" });
    const strangerLogin = await loginUser(app, stranger);
    const list = await get("/v1/auth/sessions", laptop.body.token);

    expect(list.status).toBe(200);
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      laptop.body.session.id,
      phone.body.session.id,
    ]);
    expect(list.body.sessions[0]).toMatchObject({
      current: true,
      clientKind: "web",
    });
    expect(list.body.sessions[1]).toMatchObject({
      current: false,
      clientKind: "android",
      clientName: "Pixel",
    });
    expect(JSON.stringify(list.body)).not.toMatch(/token|hash|userAgent|"ip"/i);

    const del = (id: string, token: string) =>
      request(app.getHttpServer())
        .delete(`/v1/auth/sessions/${id}`)
        .set(bearer(token));

    // Someone else's session and an unknown one look the same.
    expect(
      (await del(strangerLogin.body.session.id, laptop.body.token)).status,
    ).toBe(404);
    expect(
      (await del("2f2c1c8e-6a4d-4b0e-9d54-0a8a3e7a1111", laptop.body.token))
        .status,
    ).toBe(404);
    expect((await del("not-a-uuid", laptop.body.token)).status).toBe(400);
    expect((await get("/v1/auth/me", strangerLogin.body.token)).status).toBe(
      200,
    );

    expect((await del(phone.body.session.id, laptop.body.token)).status).toBe(
      204,
    );
    expect((await get("/v1/auth/me", phone.body.token)).status).toBe(401);
    expect((await get("/v1/auth/me", laptop.body.token)).status).toBe(200);
  });

  it("hides expired sessions from the list", async () => {
    const user = await seedUser(ds);
    const old = await loginUser(app, user);

    clock.advance(401 * DAY);

    const fresh = await loginUser(app, user);
    const list = await get("/v1/auth/sessions", fresh.body.token);

    expect(old.status).toBe(200);
    expect(list.body.sessions).toHaveLength(1);
  });
});

describe("change password", () => {
  const change = (token: string, body: object) =>
    post("/v1/users/me/password", token, body);

  it("checks the current password and the new one's rules", async () => {
    const user = await seedUser(ds);
    const token = await tokenOf(app, { kind: "user", ...user });

    const wrong = await change(token, {
      currentPassword: "not-my-password",
      newPassword: "brand-new-pw-1",
    });
    const short = await change(token, {
      currentPassword: user.password,
      newPassword: "short",
    });
    const same = await change(token, {
      currentPassword: user.password,
      newPassword: user.password,
    });

    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({
      code: "CURRENT_PASSWORD_WRONG",
      message: AUTH_MESSAGES.CURRENT_PASSWORD_WRONG,
    });
    expect(short.status).toBe(400);
    expect(short.body.message).toContain(AUTH_MESSAGES.NEW_PASSWORD_TOO_SHORT);
    expect(same.status).toBe(400);
    expect(same.body.message).toContain(AUTH_MESSAGES.NEW_PASSWORD_SAME);
  });

  it("signs out the other devices, keeps this one and switches the password", async () => {
    const user = await seedUser(ds);
    const here = await loginUser(app, user);
    const there = await loginUser(app, user);

    const done = await change(here.body.token, {
      currentPassword: user.password,
      newPassword: "brand-new-pw-1",
    });

    expect(done.status).toBe(204);
    expect((await get("/v1/auth/me", there.body.token)).status).toBe(401);
    expect((await get("/v1/auth/me", here.body.token)).status).toBe(200);
    expect((await loginUser(app, user)).status).toBe(401);
    expect(
      (await loginUser(app, { email: user.email, password: "brand-new-pw-1" }))
        .status,
    ).toBe(200);
  });

  it("is for trainees only", async () => {
    const admin = await seedAdmin(ds);
    const token = await tokenOf(app, { kind: "admin", ...admin });
    const response = await change(token, {
      currentPassword: admin.password,
      newPassword: "brand-new-pw-1",
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });
});

describe("GET /auth/me", () => {
  it("describes a PT with the lock state", async () => {
    const admin = await seedAdmin(ds, { role: "pt", passcode: "1357" });
    const token = await tokenOf(app, { kind: "admin", ...admin });
    const me = await get("/v1/auth/me", token);

    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      role: "pt",
      actor: { kind: "admin", role: "pt", locked: true, hasPasscode: true },
    });
  });

  it("is reachable by a locked admin", async () => {
    const admin = await seedAdmin(ds, { passcode: "2468" });
    const token = await tokenOf(app, { kind: "admin", ...admin });

    expect((await get("/v1/auth/me", token)).status).toBe(200);
    expect((await get("/v1/auth/sessions", token)).status).toBe(200);
    expect((await post("/v1/auth/refresh", token)).status).toBe(200);
  });
});
