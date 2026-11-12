import type { INestApplication } from "@nestjs/common";
import { AUTH_MESSAGES } from "@pt/contracts";
import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { Admin } from "../src/database/entities/admin.entity.js";
import { AdminHiddenUser } from "../src/database/entities/admin-hidden-user.entity.js";
import { LoginAttempt } from "../src/database/entities/login-attempt.entity.js";
import { Session } from "../src/database/entities/session.entity.js";
import { createTestApp } from "./support/app.js";
import {
  bearer,
  FakeClock,
  hideTrainee,
  loginAdmin,
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

const call = (
  method: "get" | "post" | "put" | "delete",
  path: string,
  token: string,
  body?: object,
) => request(app.getHttpServer())[method](path).set(bearer(token)).send(body);

const passcode = (
  action: "verify" | "change" | "reset" | "lock",
  token: string,
  body?: object,
) => call("post", `/v1/admins/me/passcode/${action}`, token, body);

const me = async (token: string) =>
  (await call("get", "/v1/auth/me", token)).body;

const failedCount = async (adminId: number) =>
  (await ds.getRepository(Admin).findOneByOrFail({ id: adminId }))
    .passcodeFailedCount;

// A signed-in admin with a passcode, locked.
const lockedAdmin = async (code = "1234") => {
  const admin = await seedAdmin(ds, { passcode: code });

  return { ...admin, token: await tokenOf(app, { kind: "admin", ...admin }) };
};

// ...and unlocked.
const unlockedAdmin = async (code = "1234") => {
  const admin = await lockedAdmin(code);

  await passcode("verify", admin.token, { passcode: code });
  return admin;
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

describe("set passcode", () => {
  it("stores a scrypt hash (not the code) and keeps this session unlocked", async () => {
    const admin = await seedAdmin(ds);
    const token = await tokenOf(app, { kind: "admin", ...admin });
    const response = await call("put", "/v1/admins/me/passcode", token, {
      passcode: "4821",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasPasscode: true,
      locked: false,
      unlockedUntil: new Date(clock.now().getTime() + 5 * MINUTE).toISOString(),
      revealedUntil: null,
    });

    const row = await ds.getRepository(Admin).findOneByOrFail({ id: admin.id });

    expect(row.passcodeHash).toMatch(/^scrypt\$/);
    expect(row.passcodeHash).not.toContain("4821");
    expect(JSON.stringify(response.body)).not.toContain("scrypt");
  });

  it("accepts exactly 4 digits", async () => {
    const admin = await seedAdmin(ds);
    const token = await tokenOf(app, { kind: "admin", ...admin });

    for (const bad of ["123", "12345", "abcd", "", "12 4"]) {
      const response = await call("put", "/v1/admins/me/passcode", token, {
        passcode: bad,
      });

      expect(response.status).toBe(400);
    }
    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: admin.id }))
        .passcodeHash,
    ).toBeNull();
  });

  it("refuses a second passcode (use change) and needs an unlocked session", async () => {
    const unlocked = await unlockedAdmin();
    const locked = await lockedAdmin();
    const again = await call("put", "/v1/admins/me/passcode", unlocked.token, {
      passcode: "9999",
    });
    const stopped = await call("put", "/v1/admins/me/passcode", locked.token, {
      passcode: "9999",
    });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe("PASSCODE_ALREADY_SET");
    expect(stopped.status).toBe(403);
    expect(stopped.body.code).toBe("ADMIN_LOCKED");
  });
});

describe("lock screen: verify", () => {
  it("unlocks for 5 minutes on the right code and resets the counter", async () => {
    const admin = await lockedAdmin("1234");

    await passcode("verify", admin.token, { passcode: "0000" });
    await passcode("verify", admin.token, { passcode: "0000" });
    expect(await failedCount(admin.id)).toBe(2);

    const ok = await passcode("verify", admin.token, { passcode: "1234" });

    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ locked: false, hasPasscode: true });
    expect(await failedCount(admin.id)).toBe(0);
    expect((await me(admin.token)).actor.locked).toBe(false);

    clock.advance(4 * MINUTE);
    expect((await me(admin.token)).actor.locked).toBe(false);
    clock.advance(2 * MINUTE);
    expect((await me(admin.token)).actor.locked).toBe(true);
  });

  it("counts attempts down and signs out on the 5th wrong code", async () => {
    const admin = await lockedAdmin("1234");
    const other = await loginAdmin(app, admin);

    for (const left of [4, 3, 2, 1]) {
      const wrong = await passcode("verify", admin.token, { passcode: "0000" });

      expect(wrong.status).toBe(403);
      expect(wrong.body).toMatchObject({
        code: "PASSCODE_WRONG",
        message: AUTH_MESSAGES.PASSCODE_WRONG,
        details: { attemptsLeft: left, signedOut: false },
      });
    }

    const last = await passcode("verify", admin.token, { passcode: "0000" });

    expect(last.status).toBe(401);
    expect(last.body).toMatchObject({
      code: "PASSCODE_SIGNED_OUT",
      details: { attemptsLeft: 0, signedOut: true },
    });
    expect((await call("get", "/v1/auth/me", admin.token)).status).toBe(401);
    expect(await failedCount(admin.id)).toBe(0);
    // Only the session that typed the codes is ended.
    expect((await call("get", "/v1/auth/me", other.body.token)).status).toBe(
      200,
    );
    // The right code afterwards does not bring the old session back.
    expect(
      (await passcode("verify", admin.token, { passcode: "1234" })).status,
    ).toBe(401);
  });

  it("is a 400 without a passcode, and trainees cannot call it", async () => {
    const admin = await seedAdmin(ds);
    const token = await tokenOf(app, { kind: "admin", ...admin });
    const user = await seedUser(ds);
    const userToken = await tokenOf(app, { kind: "user", ...user });

    expect(
      (await passcode("verify", token, { passcode: "1234" })).body.code,
    ).toBe("PASSCODE_NOT_SET");
    expect(
      (await passcode("verify", userToken, { passcode: "1234" })).status,
    ).toBe(403);
  });

  it("a new login after the lock starts locked again", async () => {
    const admin = await unlockedAdmin();
    const again = await loginAdmin(app, admin);

    expect(again.body.actor.locked).toBe(true);
  });
});

describe("lock now", () => {
  it("ends the unlock at once; admin routes then answer ADMIN_LOCKED", async () => {
    const admin = await unlockedAdmin();
    const locked = await passcode("lock", admin.token);

    expect(locked.status).toBe(200);
    expect(locked.body).toMatchObject({ locked: true, unlockedUntil: null });
    expect(
      (
        await call("put", "/v1/admins/me/passcode", admin.token, {
          passcode: "5555",
        })
      ).body.code,
    ).toBe("ADMIN_LOCKED");
  });

  it("needs a passcode to lock with", async () => {
    const admin = await seedAdmin(ds);
    const token = await tokenOf(app, { kind: "admin", ...admin });
    const response = await passcode("lock", token);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("PASSCODE_NOT_SET");
  });
});

describe("change and turn off", () => {
  it("changes the passcode only with the right current one, and rejects the same code", async () => {
    const admin = await unlockedAdmin("1234");
    const same = await passcode("change", admin.token, {
      currentPasscode: "1234",
      newPasscode: "1234",
    });
    const wrong = await passcode("change", admin.token, {
      currentPasscode: "9999",
      newPasscode: "4321",
    });

    expect(same.status).toBe(400);
    expect(same.body.code).toBe("PASSCODE_SAME");
    expect(wrong.status).toBe(403);
    expect(wrong.body.details).toMatchObject({ attemptsLeft: 4 });

    const ok = await passcode("change", admin.token, {
      currentPasscode: "1234",
      newPasscode: "4321",
    });

    expect(ok.status).toBe(200);
    expect(await failedCount(admin.id)).toBe(0);
    await passcode("lock", admin.token);
    expect(
      (await passcode("verify", admin.token, { passcode: "1234" })).status,
    ).toBe(403);
    expect(
      (await passcode("verify", admin.token, { passcode: "4321" })).status,
    ).toBe(200);
  });

  it("counts wrong codes from settings toward the same 5-strike sign-out", async () => {
    const admin = await unlockedAdmin("1234");

    for (let i = 0; i < 4; i++) {
      await call("delete", "/v1/admins/me/passcode", admin.token, {
        currentPasscode: "0000",
      });
    }

    const fifth = await passcode("change", admin.token, {
      currentPasscode: "0000",
      newPasscode: "1111",
    });

    expect(fifth.status).toBe(401);
    expect(fifth.body.code).toBe("PASSCODE_SIGNED_OUT");
    expect((await call("get", "/v1/auth/me", admin.token)).status).toBe(401);
  });

  it("turns the passcode off, but not while trainees are hidden", async () => {
    const admin = await unlockedAdmin("1234");
    const trainee = await seedUser(ds);

    await hideTrainee(ds, admin.id, trainee.id);

    const refused = await call(
      "delete",
      "/v1/admins/me/passcode",
      admin.token,
      {
        currentPasscode: "1234",
      },
    );

    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PASSCODE_HAS_HIDDEN_CHATS");
    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: admin.id }))
        .passcodeHash,
    ).not.toBeNull();

    await ds.getRepository(AdminHiddenUser).delete({ adminId: admin.id });

    const off = await call("delete", "/v1/admins/me/passcode", admin.token, {
      currentPasscode: "1234",
    });

    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ hasPasscode: false, locked: false });
    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: admin.id }))
        .passcodeHash,
    ).toBeNull();
  });
});

describe("forgot passcode (reset with the account password)", () => {
  it("is callable while locked, replaces the passcode and unlocks", async () => {
    const admin = await lockedAdmin("1234");
    const ok = await passcode("reset", admin.token, {
      password: admin.password,
      newPasscode: "7777",
    });

    expect(ok.status).toBe(200);
    expect(ok.body.locked).toBe(false);
    await passcode("lock", admin.token);
    expect(
      (await passcode("verify", admin.token, { passcode: "7777" })).status,
    ).toBe(200);
  });

  it("limits wrong passwords like logins (5 -> locked 15 minutes) without touching the passcode counter", async () => {
    const admin = await lockedAdmin("1234");

    for (let i = 0; i < 5; i++) {
      const wrong = await passcode("reset", admin.token, {
        password: "not-the-password",
        newPasscode: "7777",
      });

      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe("PASSCODE_RESET_PASSWORD_WRONG");
    }

    const locked = await passcode("reset", admin.token, {
      password: admin.password,
      newPasscode: "7777",
    });

    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("LOGIN_LOCKED");
    expect(await failedCount(admin.id)).toBe(0);

    clock.advance(16 * MINUTE);
    expect(
      (
        await passcode("reset", admin.token, {
          password: admin.password,
          newPasscode: "7777",
        })
      ).status,
    ).toBe(200);
  });
});

describe("reveal hidden trainees", () => {
  const reveal = (token: string, code: string) =>
    call("post", "/v1/admins/me/hidden-users/reveal", token, {
      passcode: code,
    });

  it("opens a fixed 10 minute window on this session only", async () => {
    const admin = await unlockedAdmin("1234");
    const otherSession = await loginAdmin(app, admin);
    const ok = await reveal(admin.token, "1234");

    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({
      revealed: true,
      revealedUntil: new Date(
        clock.now().getTime() + 10 * MINUTE,
      ).toISOString(),
    });
    expect((await me(admin.token)).actor.revealedUntil).toBe(
      ok.body.revealedUntil,
    );
    expect((await me(otherSession.body.token)).actor.revealedUntil).toBeNull();

    // The unlock heartbeat window is separate; the reveal does not slide.
    clock.advance(11 * MINUTE);
    expect((await me(admin.token)).actor.revealedUntil).toBeNull();
  });

  it("answers every failure the same quiet way and never signs out", async () => {
    const admin = await unlockedAdmin("1234");
    const noPasscode = await seedAdmin(ds);
    const noPasscodeToken = await tokenOf(app, {
      kind: "admin",
      ...noPasscode,
    });
    const quiet = { revealed: false, revealedUntil: null };

    // Not a 4-digit code: no limiter involved (ordinary searches).
    expect((await reveal(admin.token, "joe")).body).toEqual(quiet);
    expect(
      await ds
        .getRepository(LoginAttempt)
        .findOneBy({ key: `passcode-reveal:${admin.id}` }),
    ).toBeNull();
    expect((await reveal(noPasscodeToken, "1234")).body).toEqual(quiet);

    for (let i = 0; i < 5; i++) {
      expect((await reveal(admin.token, "0000")).body).toEqual(quiet);
    }
    // Rate limited: even the right code is "no match" now.
    expect((await reveal(admin.token, "1234")).body).toEqual(quiet);
    expect(await failedCount(admin.id)).toBe(0);
    expect((await call("get", "/v1/auth/me", admin.token)).status).toBe(200);

    clock.advance(16 * MINUTE);
    await passcode("verify", admin.token, { passcode: "1234" });
    expect((await reveal(admin.token, "1234")).body.revealed).toBe(true);
  });

  it("ends with the lock and with coming back from a lock", async () => {
    const admin = await unlockedAdmin("1234");

    await reveal(admin.token, "1234");
    expect((await me(admin.token)).actor.revealedUntil).not.toBeNull();

    await passcode("lock", admin.token);
    expect((await me(admin.token)).actor.revealedUntil).toBeNull();

    await passcode("verify", admin.token, { passcode: "1234" });
    expect((await me(admin.token)).actor.revealedUntil).toBeNull();

    await reveal(admin.token, "1234");
    // Verifying again (e.g. a second device flow) starts without a reveal.
    await passcode("verify", admin.token, { passcode: "1234" });
    expect((await me(admin.token)).actor.revealedUntil).toBeNull();
  });

  it("is lost on sign-out and never carried by another session", async () => {
    const admin = await unlockedAdmin("1234");

    await reveal(admin.token, "1234");
    await call("post", "/v1/auth/logout", admin.token);

    const fresh = await loginAdmin(app, admin);
    const rows = await ds.getRepository(Session).findOneByOrFail({
      id: fresh.body.session.id,
    });

    expect(rows.revealedUntil).toBeNull();
    expect(fresh.body.actor.revealedUntil).toBeNull();
  });

  it("is for admins only", async () => {
    const user = await seedUser(ds);
    const token = await tokenOf(app, { kind: "user", ...user });

    expect((await reveal(token, "1234")).status).toBe(403);
  });
});
