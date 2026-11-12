import type { INestApplication } from "@nestjs/common";
import { HIDDEN_USERS_MESSAGES, PT_MESSAGES } from "@pt/contracts";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPassword } from "../src/auth/password-hash.js";
import { Admin } from "../src/database/entities/admin.entity.js";
import { AdminHiddenUser } from "../src/database/entities/admin-hidden-user.entity.js";
import { ContactAlias } from "../src/database/entities/contact-alias.entity.js";
import { createTestApp } from "./support/app.js";
import {
  hideTrainee,
  loginAdmin,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { call } from "./support/http.js";
import { insertRow } from "./support/rows.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  app = await createTestApp({ databaseUrl: db.url, nodeEnv: "test" });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

// A signed-in admin; with a passcode the session is unlocked.
const adminToken = async (role: "super_admin" | "pt", passcode?: string) => {
  const admin = await seedAdmin(ds, { role, passcode });
  const token = await tokenOf(app, { kind: "admin", ...admin });

  if (passcode) {
    await call(app, "post", "/v1/admins/me/passcode/verify", token, {
      passcode,
    });
  }
  return { ...admin, token };
};

describe("GET /v1/pts", () => {
  it("lists every admin account with trainee counts, for a super admin only", async () => {
    const boss = await adminToken("super_admin");
    const pt = await seedAdmin(ds, { role: "pt" });
    const legacy = await seedAdmin(ds, { role: null });
    const ptToken = await adminToken("pt");

    await seedUser(ds, { ptAdminId: pt.id });
    await seedUser(ds, { ptAdminId: pt.id });
    await seedUser(ds);
    const response = await call(app, "get", "/v1/pts", boss.token);

    expect(response.status).toBe(200);
    const accounts = response.body.accounts as {
      id: number;
      role: string;
      traineeCount: number;
      username: string;
    }[];

    expect(accounts.find((a) => a.id === pt.id)).toEqual({
      id: pt.id,
      username: pt.username,
      role: "pt",
      verified: false,
      traineeCount: 2,
    });
    // Null role = super admin.
    expect(accounts.find((a) => a.id === legacy.id)).toMatchObject({
      role: "super_admin",
      traineeCount: 0,
    });
    expect(accounts.map((a) => a.id)).toEqual(
      [...accounts.map((a) => a.id)].sort((a, b) => a - b),
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /scrypt|passwordHash|passcode/i,
    );

    expect((await call(app, "get", "/v1/pts")).status).toBe(401);
    expect((await call(app, "get", "/v1/pts", ptToken.token)).status).toBe(403);
  });
});

describe("POST /v1/pts", () => {
  it("creates a PT with a hashed password and no tick, who can sign in", async () => {
    const boss = await adminToken("super_admin");
    const response = await call(app, "post", "/v1/pts", boss.token, {
      username: " Coach.An ",
      password: "long-enough-1",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      username: "Coach.An",
      role: "pt",
      verified: false,
      traineeCount: 0,
    });
    const row = await ds
      .getRepository(Admin)
      .findOneByOrFail({ id: response.body.id });

    expect(row).toMatchObject({
      usernameKey: "coach.an",
      role: "pt",
      verifiedAt: null,
    });
    expect(row.passwordHash).not.toContain("long-enough-1");
    expect(await verifyPassword("long-enough-1", row.passwordHash)).toBe(true);
    expect(
      (
        await loginAdmin(app, {
          username: "coach.an",
          password: "long-enough-1",
        })
      ).status,
    ).toBe(200);
  });

  it("rejects a bad username and a short password with field messages", async () => {
    const boss = await adminToken("super_admin");
    const before = await ds.getRepository(Admin).count();
    const response = await call(app, "post", "/v1/pts", boss.token, {
      username: "a b",
      password: "short",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_FAILED");
    expect(response.body.message).toContain(PT_MESSAGES.USERNAME_INVALID);
    expect(response.body.message).toContain(PT_MESSAGES.PASSWORD_TOO_SHORT);
    expect(await ds.getRepository(Admin).count()).toBe(before);
  });

  it("rejects a duplicate username case-insensitively", async () => {
    const boss = await adminToken("super_admin");

    await seedAdmin(ds, { username: "CoachDup", role: "pt" });
    const response = await call(app, "post", "/v1/pts", boss.token, {
      username: "coachdup",
      password: "long-enough-1",
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "USERNAME_TAKEN",
      message: PT_MESSAGES.USERNAME_TAKEN,
    });
  });

  it("refuses a PT caller and writes nothing", async () => {
    const pt = await adminToken("pt");
    const before = await ds.getRepository(Admin).count();
    const response = await call(app, "post", "/v1/pts", pt.token, {
      username: "sneaky",
      password: "long-enough-1",
    });

    expect(response.status).toBe(403);
    expect(await ds.getRepository(Admin).count()).toBe(before);
  });
});

describe("PUT /v1/admins/:adminId/verified", () => {
  it("grants and removes the tick of any admin", async () => {
    const boss = await adminToken("super_admin");
    const pt = await seedAdmin(ds, { role: "pt" });
    const grant = await call(
      app,
      "put",
      `/v1/admins/${pt.id}/verified`,
      boss.token,
      {
        verified: true,
      },
    );

    expect(grant.status).toBe(204);
    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: pt.id })).verifiedAt,
    ).toBeInstanceOf(Date);
    const listed = await call(app, "get", "/v1/pts", boss.token);

    expect(
      listed.body.accounts.find((a: { id: number }) => a.id === pt.id).verified,
    ).toBe(true);
    await call(app, "put", `/v1/admins/${pt.id}/verified`, boss.token, {
      verified: false,
    });
    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: pt.id })).verifiedAt,
    ).toBeNull();
  });

  it("reports an unknown admin, bad input and refuses a PT caller", async () => {
    const boss = await adminToken("super_admin");
    const pt = await adminToken("pt");
    const unknown = await call(
      app,
      "put",
      "/v1/admins/99999/verified",
      boss.token,
      {
        verified: true,
      },
    );
    const bad = await call(
      app,
      "put",
      `/v1/admins/${pt.id}/verified`,
      boss.token,
      {
        verified: "yes",
      },
    );
    const byPt = await call(
      app,
      "put",
      `/v1/admins/${pt.id}/verified`,
      pt.token,
      {
        verified: true,
      },
    );

    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({
      code: "ADMIN_NOT_FOUND",
      message: PT_MESSAGES.ADMIN_NOT_FOUND,
    });
    expect(bad.status).toBe(400);
    expect(byPt.status).toBe(403);
    expect(
      (
        await call(app, "put", `/v1/admins/${pt.id}/verified`, null, {
          verified: true,
        })
      ).status,
    ).toBe(401);
  });
});

describe("own admin profile and settings", () => {
  it("returns the profile without secrets and saves presence, colour, locale and bio", async () => {
    const pt = await adminToken("pt", "2468");
    const profile = await call(app, "get", "/v1/admins/me", pt.token);

    expect(profile.status).toBe(200);
    expect(profile.body).toEqual({
      id: pt.id,
      username: pt.username,
      role: "pt",
      verified: false,
      locale: null,
      bio: null,
      chatColor: null,
      presenceHidden: false,
      avatarUrl: null,
    });
    const presence = await call(
      app,
      "put",
      "/v1/admins/me/presence-hidden",
      pt.token,
      {
        isHidden: true,
      },
    );
    const color = await call(app, "put", "/v1/admins/me/chat-color", pt.token, {
      color: "teal",
    });
    const locale = await call(app, "put", "/v1/me/locale", pt.token, {
      locale: "en",
    });
    const bio = await call(app, "put", "/v1/me/bio", pt.token, {
      bio: "  Coach  ",
    });

    expect(presence.body).toEqual({ presenceHidden: true });
    expect(color.body).toEqual({ color: "teal" });
    expect(locale.body).toEqual({ locale: "en" });
    expect(bio.body).toEqual({ bio: "Coach" });
    expect(
      (await call(app, "get", "/v1/admins/me", pt.token)).body,
    ).toMatchObject({
      presenceHidden: true,
      chatColor: "teal",
      locale: "en",
      bio: "Coach",
    });
    // The other fields and other admins are not touched; null clears the colour.
    const other = await seedAdmin(ds, { role: "pt" });

    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: other.id }))
        .presenceHidden,
    ).toBe(false);
    await call(app, "put", "/v1/admins/me/chat-color", pt.token, {
      color: null,
    });
    expect(
      (await call(app, "get", "/v1/admins/me", pt.token)).body.chatColor,
    ).toBeNull();
  });

  it("rejects a non-boolean presence, an unknown colour or locale and a long bio", async () => {
    const pt = await adminToken("pt");
    const checks = await Promise.all([
      call(app, "put", "/v1/admins/me/presence-hidden", pt.token, {
        isHidden: "yes",
      }),
      call(app, "put", "/v1/admins/me/chat-color", pt.token, {
        color: "mauve",
      }),
      call(app, "put", "/v1/me/locale", pt.token, { locale: "fr" }),
      call(app, "put", "/v1/me/bio", pt.token, { bio: "x".repeat(151) }),
    ]);

    for (const response of checks) {
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
    expect(
      (await call(app, "get", "/v1/admins/me", pt.token)).body.presenceHidden,
    ).toBe(false);
  });

  it("is admin only, and a locked admin can still set the language", async () => {
    const trainee = await seedUser(ds);
    const userToken = await tokenOf(app, { kind: "user", ...trainee });
    const locked = await seedAdmin(ds, { role: "pt", passcode: "1234" });
    const lockedToken = await tokenOf(app, { kind: "admin", ...locked });

    for (const [method, path, body] of [
      ["get", "/v1/admins/me", undefined],
      ["put", "/v1/admins/me/presence-hidden", { isHidden: true }],
      ["put", "/v1/admins/me/chat-color", { color: null }],
    ] as const) {
      expect((await call(app, method, path, null, body)).status).toBe(401);
      expect((await call(app, method, path, userToken, body)).status).toBe(403);
      const stopped = await call(app, method, path, lockedToken, body);

      expect(stopped.status).toBe(403);
      expect(stopped.body.code).toBe("ADMIN_LOCKED");
    }
    const locale = await call(app, "put", "/v1/me/locale", lockedToken, {
      locale: "zh",
    });

    expect(locale.status).toBe(200);
    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: locked.id })).locale,
    ).toBe("zh");
  });
});

describe("hidden trainees", () => {
  it("refuses to hide without a passcode and stores nothing", async () => {
    const pt = await adminToken("pt");
    const user = await seedUser(ds, { ptAdminId: pt.id });
    const response = await call(
      app,
      "post",
      "/v1/admins/me/hidden-users",
      pt.token,
      {
        userIds: [user.id],
      },
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "PASSCODE_REQUIRED",
      message: HIDDEN_USERS_MESSAGES.PASSCODE_REQUIRED,
    });
    expect(
      await ds.getRepository(AdminHiddenUser).countBy({ adminId: pt.id }),
    ).toBe(0);
  });

  it("hides many at once, ignoring unknown ids, other workspaces and repeats", async () => {
    const pt = await adminToken("pt", "1111");
    const other = await seedAdmin(ds, { role: "pt" });
    const a = await seedUser(ds, { ptAdminId: pt.id });
    const b = await seedUser(ds, { ptAdminId: pt.id });
    const theirs = await seedUser(ds, { ptAdminId: other.id });
    const first = await call(
      app,
      "post",
      "/v1/admins/me/hidden-users",
      pt.token,
      {
        userIds: [a.id, b.id, theirs.id, 999999],
      },
    );
    const repeat = await call(
      app,
      "post",
      "/v1/admins/me/hidden-users",
      pt.token,
      {
        userIds: [a.id, a.id],
      },
    );

    expect(first.status).toBe(201);
    expect(first.body).toEqual({ hidden: 2 });
    expect(repeat.body).toEqual({ hidden: 1 });
    expect(
      (await ds.getRepository(AdminHiddenUser).findBy({ adminId: pt.id }))
        .map((row) => row.userId)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    expect(
      await ds.getRepository(AdminHiddenUser).countBy({ userId: theirs.id }),
    ).toBe(0);
  });

  it("lets a super admin hide any trainee, and rejects malformed ids", async () => {
    const boss = await adminToken("super_admin", "2222");
    const user = await seedUser(ds);
    const ok = await call(
      app,
      "post",
      "/v1/admins/me/hidden-users",
      boss.token,
      {
        userIds: [user.id],
      },
    );

    expect(ok.body).toEqual({ hidden: 1 });
    for (const userIds of [
      [],
      [0],
      ["a"],
      Array.from({ length: 101 }, (_, i) => i + 1),
    ]) {
      const bad = await call(
        app,
        "post",
        "/v1/admins/me/hidden-users",
        boss.token,
        { userIds },
      );

      expect(bad.status).toBe(400);
    }
    expect(
      (await call(app, "get", "/v1/admins/me/hidden-users/abc", boss.token))
        .status,
    ).toBe(400);
  });

  it("reports whether a trainee is hidden, per admin, and unhides", async () => {
    const pt = await adminToken("pt", "3333");
    const pt2 = await adminToken("super_admin", "4444");
    const user = await seedUser(ds, { ptAdminId: pt.id });

    await hideTrainee(ds, pt.id, user.id);
    expect(
      (
        await call(
          app,
          "get",
          `/v1/admins/me/hidden-users/${user.id}`,
          pt.token,
        )
      ).body,
    ).toEqual({ hidden: true });
    expect(
      (
        await call(
          app,
          "get",
          `/v1/admins/me/hidden-users/${user.id}`,
          pt2.token,
        )
      ).body,
    ).toEqual({ hidden: false });
    const removed = await call(
      app,
      "delete",
      `/v1/admins/me/hidden-users/${user.id}`,
      pt.token,
    );

    expect(removed.status).toBe(204);
    expect(
      (
        await call(
          app,
          "get",
          `/v1/admins/me/hidden-users/${user.id}`,
          pt.token,
        )
      ).body,
    ).toEqual({ hidden: false });
    // Unhiding something that is not hidden is a quiet no-op.
    expect(
      (
        await call(
          app,
          "delete",
          `/v1/admins/me/hidden-users/${user.id}`,
          pt.token,
        )
      ).status,
    ).toBe(204);
  });

  it("lists hidden trainees only to the hiding admin in a revealed session, with their own nicknames", async () => {
    const pt = await adminToken("pt", "5555");
    const intruder = await adminToken("super_admin", "6666");
    const zed = await seedUser(ds, { name: "Zed", ptAdminId: pt.id });
    const amy = await seedUser(ds, { name: "Amy", ptAdminId: pt.id });
    const shown = await seedUser(ds, { name: "Shown", ptAdminId: pt.id });

    await hideTrainee(ds, pt.id, zed.id);
    await hideTrainee(ds, pt.id, amy.id);
    await insertRow(ds, ContactAlias, {
      ownerKey: `admin:${pt.id}`,
      targetKey: `user:${amy.id}`,
      alias: "Champ",
    });
    await hideTrainee(ds, intruder.id, shown.id);

    // Not revealed: indistinguishable from "nothing hidden".
    const quiet = await call(
      app,
      "get",
      "/v1/admins/me/hidden-users",
      pt.token,
    );

    expect(quiet.body).toEqual({ users: [] });
    const wrong = await call(
      app,
      "post",
      "/v1/admins/me/hidden-users/reveal",
      pt.token,
      {
        passcode: "9999",
      },
    );

    expect(wrong.body).toEqual({ revealed: false, revealedUntil: null });
    expect(
      (await call(app, "get", "/v1/admins/me/hidden-users", pt.token)).body,
    ).toEqual({ users: [] });
    const right = await call(
      app,
      "post",
      "/v1/admins/me/hidden-users/reveal",
      pt.token,
      {
        passcode: "5555",
      },
    );

    expect(right.body.revealed).toBe(true);
    const revealed = await call(
      app,
      "get",
      "/v1/admins/me/hidden-users",
      pt.token,
    );

    expect(revealed.status).toBe(200);
    expect(revealed.body.users).toEqual([
      {
        userId: amy.id,
        userName: "Amy",
        displayName: "Champ",
        avatarUrl: null,
      },
      { userId: zed.id, userName: "Zed", displayName: "Zed", avatarUrl: null },
    ]);
    // Another admin's reveal never shows this admin's list.
    await call(
      app,
      "post",
      "/v1/admins/me/hidden-users/reveal",
      intruder.token,
      {
        passcode: "6666",
      },
    );
    const theirs = await call(
      app,
      "get",
      "/v1/admins/me/hidden-users",
      intruder.token,
    );

    expect(theirs.body.users.map((u: { userId: number }) => u.userId)).toEqual([
      shown.id,
    ]);
  });

  it("needs an unlocked admin", async () => {
    const trainee = await seedUser(ds);
    const userToken = await tokenOf(app, { kind: "user", ...trainee });
    const locked = await seedAdmin(ds, { role: "pt", passcode: "1234" });
    const lockedToken = await tokenOf(app, { kind: "admin", ...locked });

    expect((await call(app, "get", "/v1/admins/me/hidden-users")).status).toBe(
      401,
    );
    expect(
      (await call(app, "get", "/v1/admins/me/hidden-users", userToken)).status,
    ).toBe(403);
    const stopped = await call(
      app,
      "post",
      "/v1/admins/me/hidden-users",
      lockedToken,
      {
        userIds: [trainee.id],
      },
    );

    expect(stopped.status).toBe(403);
    expect(stopped.body.code).toBe("ADMIN_LOCKED");
  });
});
