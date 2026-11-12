import type { INestApplication } from "@nestjs/common";
import { MEMBER_MESSAGES, PT_MESSAGES, toNameKey } from "@pt/contracts";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ContactAlias } from "../src/database/entities/contact-alias.entity.js";
import { Session } from "../src/database/entities/session.entity.js";
import { User } from "../src/database/entities/user.entity.js";
import { createTestApp } from "./support/app.js";
import {
  hideTrainee,
  loginUser,
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

const withNameKey = async (
  options: Parameters<typeof seedUser>[1] & { name: string },
) => {
  const user = await seedUser(ds, options);

  await ds
    .getRepository(User)
    .update({ id: user.id }, { nameKey: toNameKey(options.name) });
  return user;
};

describe("auth on every trainees route", () => {
  it("answers 401 without a session and 403 to a trainee", async () => {
    const trainee = await seedUser(ds);
    const token = await tokenOf(app, { kind: "user", ...trainee });
    const routes: [Parameters<typeof call>[1], string][] = [
      ["get", "/v1/trainees"],
      ["post", "/v1/trainees"],
      ["get", `/v1/trainees/${trainee.id}`],
      ["delete", `/v1/trainees/${trainee.id}`],
      ["patch", `/v1/trainees/${trainee.id}/email`],
      ["post", `/v1/trainees/${trainee.id}/password-reset`],
      ["put", `/v1/trainees/${trainee.id}/pt`],
    ];

    for (const [method, path] of routes) {
      expect((await call(app, method, path)).status, path).toBe(401);
      const forbidden = await call(app, method, path, token, {});

      expect(forbidden.status, path).toBe(403);
      expect(forbidden.body.code).toBe("FORBIDDEN");
    }
  });

  it("stops a passcode-locked admin", async () => {
    const admin = await seedAdmin(ds, { role: "pt", passcode: "1234" });
    const token = await tokenOf(app, { kind: "admin", ...admin });
    const response = await call(app, "get", "/v1/trainees", token);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ADMIN_LOCKED");
  });
});

describe("GET /v1/trainees", () => {
  it("gives a PT only their workspace, a super admin everyone, sorted by name", async () => {
    const pt = await adminToken("pt");
    const otherPt = await seedAdmin(ds, { role: "pt" });
    const boss = await adminToken("super_admin");
    const mine2 = await withNameKey({ name: "Zed", ptAdminId: pt.id });
    const mine1 = await withNameKey({ name: "Ann", ptAdminId: pt.id });
    const theirs = await withNameKey({ name: "Bob", ptAdminId: otherPt.id });
    const nobody = await withNameKey({ name: "Cat" });

    const ptList = await call(app, "get", "/v1/trainees", pt.token);

    expect(ptList.status).toBe(200);
    expect(ptList.body.trainees).toEqual([
      expect.objectContaining({ id: mine1.id, name: "Ann", ptAdminId: pt.id }),
      expect.objectContaining({ id: mine2.id, name: "Zed" }),
    ]);

    const all = await call(app, "get", "/v1/trainees", boss.token);
    const ids = all.body.trainees.map((t: { id: number }) => t.id);

    expect(ids).toEqual(
      expect.arrayContaining([mine1.id, mine2.id, theirs.id, nobody.id]),
    );

    const onePt = await call(
      app,
      "get",
      `/v1/trainees?ptAdminId=${otherPt.id}`,
      boss.token,
    );

    expect(onePt.body.trainees.map((t: { id: number }) => t.id)).toEqual([
      theirs.id,
    ]);
    // A PT cannot widen their list with the filter.
    const widened = await call(
      app,
      "get",
      `/v1/trainees?ptAdminId=${otherPt.id}`,
      pt.token,
    );

    expect(widened.body.trainees.map((t: { id: number }) => t.id)).toEqual([
      mine1.id,
      mine2.id,
    ]);
  });

  it("searches without accents or case and escapes LIKE wildcards", async () => {
    const boss = await adminToken("super_admin");
    const target = await withNameKey({ name: "Nguyễn Văn Đức" });

    await withNameKey({ name: "Plain 100% Name" });
    const hit = await call(app, "get", "/v1/trainees?q=van%20DUC", boss.token);

    expect(hit.body.trainees.map((t: { id: number }) => t.id)).toEqual([
      target.id,
    ]);
    const wildcard = await call(app, "get", "/v1/trainees?q=%25", boss.token);

    expect(wildcard.body.trainees.map((t: { name: string }) => t.name)).toEqual(
      ["Plain 100% Name"],
    );
  });

  it("leaves out trainees this admin hid, for that admin only, and shows their own nickname", async () => {
    const pt = await adminToken("pt");
    const pt2 = await adminToken("super_admin");
    const shown = await seedUser(ds, { name: "Shown", ptAdminId: pt.id });
    const hidden = await seedUser(ds, { name: "Hidden", ptAdminId: pt.id });

    await hideTrainee(ds, pt.id, hidden.id);
    await insertRow(ds, ContactAlias, {
      ownerKey: `admin:${pt.id}`,
      targetKey: `user:${shown.id}`,
      alias: "Champ",
    });
    await insertRow(ds, ContactAlias, {
      ownerKey: `admin:${pt2.id}`,
      targetKey: `user:${shown.id}`,
      alias: "Other admin's pet name",
    });

    const mine = await call(app, "get", "/v1/trainees", pt.token);

    expect(mine.body.trainees).toEqual([
      expect.objectContaining({
        id: shown.id,
        name: "Shown",
        displayName: "Champ",
      }),
    ]);
    const others = await call(app, "get", "/v1/trainees", pt2.token);
    const hiddenForOthers = others.body.trainees.find(
      (t: { id: number }) => t.id === hidden.id,
    );

    expect(hiddenForOthers).toMatchObject({ displayName: "Hidden" });
  });

  it("never exposes hashes or the stored photo", async () => {
    const pt = await adminToken("pt");

    await seedUser(ds, { ptAdminId: pt.id });
    const response = await call(app, "get", "/v1/trainees", pt.token);

    expect(JSON.stringify(response.body)).not.toMatch(
      /scrypt|passwordHash|passcode|avatar":"data/i,
    );
    expect(Object.keys(response.body.trainees[0]).sort()).toEqual([
      "avatarUrl",
      "displayName",
      "id",
      "name",
      "ptAdminId",
    ]);
  });
});

describe("POST /v1/trainees", () => {
  const body = (name: string, email: string, extra: object = {}) => ({
    name,
    email,
    ...extra,
  });

  it("puts a PT's trainee in their own workspace and ignores a posted PT", async () => {
    const pt = await adminToken("pt");
    const other = await seedAdmin(ds, { role: "pt" });
    const response = await call(
      app,
      "post",
      "/v1/trainees",
      pt.token,
      body("  Lan   Anh ", " Lan@Example.com ", { ptAdminId: other.id }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      name: "Lan Anh",
      email: "Lan@Example.com",
      ptAdminId: pt.id,
      password: expect.stringMatching(/^[A-HJ-NP-Za-km-z2-9]{12}$/),
    });
    const row = await ds
      .getRepository(User)
      .findOneByOrFail({ id: response.body.id });

    expect(row).toMatchObject({
      nameKey: "lan anh",
      emailKey: "lan@example.com",
      ptAdminId: pt.id,
    });
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain(response.body.password);
    expect(row.passwordChangedAt).toBeInstanceOf(Date);
    // The password works.
    const login = await loginUser(app, {
      email: "lan@example.com",
      password: response.body.password,
    });

    expect(login.status).toBe(200);
  });

  it("lets a super admin leave the PT empty or pick an existing PT, never another super admin", async () => {
    const boss = await adminToken("super_admin");
    const pt = await seedAdmin(ds, { role: "pt" });
    const noPt = await call(
      app,
      "post",
      "/v1/trainees",
      boss.token,
      body("No Pt", "nopt@example.com"),
    );
    const picked = await call(
      app,
      "post",
      "/v1/trainees",
      boss.token,
      body("Picked", "picked@example.com", { ptAdminId: pt.id }),
    );
    const refused = await call(
      app,
      "post",
      "/v1/trainees",
      boss.token,
      body("Refused", "refused@example.com", { ptAdminId: boss.id }),
    );
    const missing = await call(
      app,
      "post",
      "/v1/trainees",
      boss.token,
      body("Missing", "missing@example.com", { ptAdminId: 987654 }),
    );

    expect(noPt.body.ptAdminId).toBeNull();
    expect(picked.body.ptAdminId).toBe(pt.id);
    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({
      code: "PT_NOT_FOUND",
      message: PT_MESSAGES.PT_NOT_FOUND,
    });
    expect(missing.status).toBe(404);
    expect(await ds.getRepository(User).countBy({ nameKey: "refused" })).toBe(
      0,
    );
  });

  it("validates name and email with the web's messages", async () => {
    const pt = await adminToken("pt");
    const post = (payload: object) =>
      call(app, "post", "/v1/trainees", pt.token, payload);

    const empty = await post(body("   ", "a@b.co"));
    const long = await post(body("x".repeat(61), "a@b.co"));
    const badEmail = await post(body("Valid", "not-an-email"));
    const noEmail = await post({ name: "Valid" });

    for (const response of [empty, long, badEmail, noEmail]) {
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
    expect(empty.body.message).toContain(MEMBER_MESSAGES.NAME_REQUIRED);
    expect(long.body.message).toContain(MEMBER_MESSAGES.NAME_TOO_LONG);
    expect(badEmail.body.message).toContain("Email không hợp lệ");
  });

  it("refuses a taken name (ignoring case and accents) or email", async () => {
    const pt = await adminToken("pt");
    const first = await call(
      app,
      "post",
      "/v1/trainees",
      pt.token,
      body("Trần Minh", "minh@example.com"),
    );
    const sameName = await call(
      app,
      "post",
      "/v1/trainees",
      pt.token,
      body("TRAN  minh", "other@example.com"),
    );
    const sameEmail = await call(
      app,
      "post",
      "/v1/trainees",
      pt.token,
      body("Someone Else", "MINH@example.com"),
    );

    expect(first.status).toBe(201);
    expect(sameName.status).toBe(409);
    expect(sameName.body).toMatchObject({
      code: "NAME_TAKEN",
      message: MEMBER_MESSAGES.NAME_TAKEN,
    });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body).toMatchObject({
      code: "EMAIL_TAKEN",
      message: MEMBER_MESSAGES.EMAIL_TAKEN,
    });
    expect(
      await ds.getRepository(User).countBy({ nameKey: "someone else" }),
    ).toBe(0);
  });
});

describe("GET /v1/trainees/:userId", () => {
  it("returns the detail without any secret", async () => {
    const pt = await adminToken("pt");
    const user = await seedUser(ds, {
      name: "Detail Dan",
      email: "dan@example.com",
      ptAdminId: pt.id,
    });
    const response = await call(
      app,
      "get",
      `/v1/trainees/${user.id}`,
      pt.token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: user.id,
      name: "Detail Dan",
      displayName: "Detail Dan",
      email: "dan@example.com",
      hasLogin: true,
      chatEnabled: false,
      hidden: false,
      ptAdminId: pt.id,
      avatarUrl: null,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it("answers the same 404 for another PT's trainee, a missing one and a bad id", async () => {
    const pt = await adminToken("pt");
    const other = await seedAdmin(ds, { role: "pt" });
    const theirs = await seedUser(ds, { ptAdminId: other.id });
    const unassigned = await seedUser(ds);

    const answers = await Promise.all(
      [theirs.id, unassigned.id, 99999999, "abc"].map((id) =>
        call(app, "get", `/v1/trainees/${id}`, pt.token),
      ),
    );

    for (const response of answers) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "TRAINEE_NOT_FOUND" });
    }
  });

  it("hides a hidden trainee from the hiding admin until the passcode reveals, then shows the flag", async () => {
    const pt = await adminToken("pt", "4821");
    const other = await adminToken("super_admin");
    const user = await seedUser(ds, { ptAdminId: pt.id });

    await hideTrainee(ds, pt.id, user.id);
    const hiddenAnswer = await call(
      app,
      "get",
      `/v1/trainees/${user.id}`,
      pt.token,
    );
    const superAnswer = await call(
      app,
      "get",
      `/v1/trainees/${user.id}`,
      other.token,
    );

    expect(hiddenAnswer.status).toBe(404);
    expect(superAnswer.status).toBe(200);
    expect(superAnswer.body.hidden).toBe(false);

    await call(app, "post", "/v1/admins/me/hidden-users/reveal", pt.token, {
      passcode: "4821",
    });
    const revealed = await call(
      app,
      "get",
      `/v1/trainees/${user.id}`,
      pt.token,
    );

    expect(revealed.status).toBe(200);
    expect(revealed.body.hidden).toBe(true);
  });
});

describe("PATCH /v1/trainees/:userId/email", () => {
  it("changes the email and keeps the password and open sessions", async () => {
    const pt = await adminToken("pt");
    const user = await seedUser(ds, { ptAdminId: pt.id });
    const userToken = await tokenOf(app, { kind: "user", ...user });
    const before = await ds
      .getRepository(User)
      .findOneByOrFail({ id: user.id });
    const response = await call(
      app,
      "patch",
      `/v1/trainees/${user.id}/email`,
      pt.token,
      { email: "  New.Mail@Example.com " },
    );

    expect(response.status).toBe(204);
    const row = await ds.getRepository(User).findOneByOrFail({ id: user.id });

    expect(row).toMatchObject({
      email: "New.Mail@Example.com",
      emailKey: "new.mail@example.com",
      passwordHash: before.passwordHash,
    });
    expect((await call(app, "get", "/v1/auth/me", userToken)).status).toBe(200);
    expect(
      (
        await loginUser(app, {
          email: "new.mail@example.com",
          password: user.password,
        })
      ).status,
    ).toBe(200);
  });

  it("refuses an email used by someone else, accepts the trainee's own in another case", async () => {
    const pt = await adminToken("pt");
    const a = await seedUser(ds, {
      email: "taken@example.com",
      ptAdminId: pt.id,
    });
    const b = await seedUser(ds, { ptAdminId: pt.id });
    const taken = await call(
      app,
      "patch",
      `/v1/trainees/${b.id}/email`,
      pt.token,
      {
        email: "TAKEN@example.com",
      },
    );
    const own = await call(
      app,
      "patch",
      `/v1/trainees/${a.id}/email`,
      pt.token,
      {
        email: "TAKEN@example.com",
      },
    );

    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({
      code: "EMAIL_TAKEN",
      message: MEMBER_MESSAGES.EMAIL_TAKEN,
    });
    expect(own.status).toBe(204);
  });

  it("rejects a malformed email and another workspace's trainee", async () => {
    const pt = await adminToken("pt");
    const other = await seedAdmin(ds, { role: "pt" });
    const mine = await seedUser(ds, { ptAdminId: pt.id });
    const theirs = await seedUser(ds, { ptAdminId: other.id });
    const bad = await call(
      app,
      "patch",
      `/v1/trainees/${mine.id}/email`,
      pt.token,
      {
        email: "nope",
      },
    );
    const out = await call(
      app,
      "patch",
      `/v1/trainees/${theirs.id}/email`,
      pt.token,
      {
        email: "ok@example.com",
      },
    );

    expect(bad.status).toBe(400);
    expect(out.status).toBe(404);
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: theirs.id })).email,
    ).toBe(theirs.email);
  });
});

describe("POST /v1/trainees/:userId/password-reset", () => {
  it("sets a new password, returns it once, and signs the trainee out everywhere", async () => {
    const pt = await adminToken("pt");
    const user = await seedUser(ds, { ptAdminId: pt.id });
    const phone = await tokenOf(app, { kind: "user", ...user });
    const laptop = await tokenOf(app, { kind: "user", ...user });
    const otherUser = await seedUser(ds, { ptAdminId: pt.id });
    const otherToken = await tokenOf(app, { kind: "user", ...otherUser });

    const response = await call(
      app,
      "post",
      `/v1/trainees/${user.id}/password-reset`,
      pt.token,
    );

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["password"]);
    expect(response.body.password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    // Both devices are signed out; another trainee's session is untouched.
    expect((await call(app, "get", "/v1/auth/me", phone)).status).toBe(401);
    expect((await call(app, "get", "/v1/auth/me", laptop)).status).toBe(401);
    expect((await call(app, "get", "/v1/auth/me", otherToken)).status).toBe(
      200,
    );
    expect(await ds.getRepository(Session).countBy({ userId: user.id })).toBe(
      0,
    );
    // Old password is dead, new one works.
    expect(
      (await loginUser(app, { email: user.email, password: user.password }))
        .status,
    ).toBe(401);
    expect(
      (
        await loginUser(app, {
          email: user.email,
          password: response.body.password,
        })
      ).status,
    ).toBe(200);
    const row = await ds.getRepository(User).findOneByOrFail({ id: user.id });

    expect(row.passwordChangedAt).toBeInstanceOf(Date);
  });

  it("refuses a trainee without a login, and another workspace's trainee", async () => {
    const pt = await adminToken("pt");
    const other = await seedAdmin(ds, { role: "pt" });
    const noLogin = await seedUser(ds, { ptAdminId: pt.id });
    const theirs = await seedUser(ds, { ptAdminId: other.id });

    await ds
      .getRepository(User)
      .update(
        { id: noLogin.id },
        { email: null, emailKey: null, passwordHash: null },
      );
    const none = await call(
      app,
      "post",
      `/v1/trainees/${noLogin.id}/password-reset`,
      pt.token,
    );
    const out = await call(
      app,
      "post",
      `/v1/trainees/${theirs.id}/password-reset`,
      pt.token,
    );

    expect(none.status).toBe(400);
    expect(none.body).toMatchObject({
      code: "NO_LOGIN",
      message: MEMBER_MESSAGES.NO_LOGIN,
    });
    expect(out.status).toBe(404);
    expect(
      (await loginUser(app, { email: theirs.email, password: theirs.password }))
        .status,
    ).toBe(200);
  });
});

describe("PUT /v1/trainees/:userId/pt", () => {
  it("lets a super admin assign and clear the PT", async () => {
    const boss = await adminToken("super_admin");
    const pt = await seedAdmin(ds, { role: "pt" });
    const user = await seedUser(ds);
    const assign = await call(
      app,
      "put",
      `/v1/trainees/${user.id}/pt`,
      boss.token,
      {
        ptAdminId: pt.id,
      },
    );

    expect(assign.status).toBe(204);
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: user.id })).ptAdminId,
    ).toBe(pt.id);
    const clear = await call(
      app,
      "put",
      `/v1/trainees/${user.id}/pt`,
      boss.token,
      {
        ptAdminId: null,
      },
    );

    expect(clear.status).toBe(204);
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: user.id })).ptAdminId,
    ).toBeNull();
  });

  it("refuses a PT caller, a target that is not a PT and an unknown trainee", async () => {
    const boss = await adminToken("super_admin");
    const pt = await adminToken("pt");
    const user = await seedUser(ds, { ptAdminId: pt.id });
    const byPt = await call(
      app,
      "put",
      `/v1/trainees/${user.id}/pt`,
      pt.token,
      {
        ptAdminId: pt.id,
      },
    );
    const notPt = await call(
      app,
      "put",
      `/v1/trainees/${user.id}/pt`,
      boss.token,
      {
        ptAdminId: boss.id,
      },
    );
    const unknown = await call(
      app,
      "put",
      "/v1/trainees/987654/pt",
      boss.token,
      {
        ptAdminId: pt.id,
      },
    );
    const bad = await call(
      app,
      "put",
      `/v1/trainees/${user.id}/pt`,
      boss.token,
      {
        ptAdminId: "x",
      },
    );

    expect(byPt.status).toBe(403);
    expect(notPt.status).toBe(404);
    expect(notPt.body.code).toBe("PT_NOT_FOUND");
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("USER_NOT_FOUND");
    expect(bad.status).toBe(400);
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: user.id })).ptAdminId,
    ).toBe(pt.id);
  });
});

describe("DELETE /v1/trainees/:userId", () => {
  it("is scoped: another PT's trainee answers 404 and stays", async () => {
    const pt = await adminToken("pt");
    const other = await seedAdmin(ds, { role: "pt" });
    const theirs = await seedUser(ds, { ptAdminId: other.id });
    const response = await call(
      app,
      "delete",
      `/v1/trainees/${theirs.id}`,
      pt.token,
    );

    expect(response.status).toBe(404);
    expect(await ds.getRepository(User).countBy({ id: theirs.id })).toBe(1);
  });

  it("deletes a trainee the admin hid without needing a reveal, and a missing one is 404", async () => {
    const pt = await adminToken("pt", "1357");
    const user = await seedUser(ds, { ptAdminId: pt.id });

    await hideTrainee(ds, pt.id, user.id);
    const response = await call(
      app,
      "delete",
      `/v1/trainees/${user.id}`,
      pt.token,
    );

    expect(response.status).toBe(204);
    expect(await ds.getRepository(User).countBy({ id: user.id })).toBe(0);
    expect(
      (await call(app, "delete", `/v1/trainees/${user.id}`, pt.token)).status,
    ).toBe(404);
  });
});
