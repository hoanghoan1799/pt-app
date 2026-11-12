import type { INestApplication } from "@nestjs/common";
import { ALIAS_MESSAGES, PROFILE_MESSAGES } from "@pt/contracts";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ContactAlias } from "../src/database/entities/contact-alias.entity.js";
import { SocialBlock } from "../src/database/entities/social-block.entity.js";
import { User } from "../src/database/entities/user.entity.js";
import { createTestApp } from "./support/app.js";
import { hideTrainee, seedAdmin, seedUser, tokenOf } from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { call } from "./support/http.js";

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

const trainee = async (
  options: Parameters<typeof seedUser>[1] = {},
  social = false,
) => {
  const user = await seedUser(ds, options);

  if (social) {
    await ds.getRepository(User).update({ id: user.id }, { termsVersion: 1 });
  }
  return { ...user, token: await tokenOf(app, { kind: "user", ...user }) };
};

const admin = async (role: "super_admin" | "pt" = "pt") => {
  const row = await seedAdmin(ds, { role });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

const aliasOf = (ownerKey: string, targetKey: string) =>
  ds.getRepository(ContactAlias).findOneBy({ ownerKey, targetKey });

describe("GET /v1/users/me", () => {
  it("returns the trainee's own profile and nothing secret", async () => {
    const pt = await seedAdmin(ds, { role: "pt" });
    const me = await trainee({
      name: "Mai",
      email: "mai@example.com",
      ptAdminId: pt.id,
    });
    const response = await call(app, "get", "/v1/users/me", me.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: me.id,
      name: "Mai",
      email: "mai@example.com",
      locale: null,
      bio: null,
      chatColor: null,
      chatEnabled: false,
      avatarUrl: null,
      ptAdminId: pt.id,
    });
  });

  it("answers 401 without a session and 403 to an admin", async () => {
    const pt = await admin();

    expect((await call(app, "get", "/v1/users/me")).status).toBe(401);
    expect((await call(app, "get", "/v1/users/me", pt.token)).status).toBe(403);
  });
});

describe("PUT /v1/users/me/chat-color", () => {
  it("saves the trainee's own colour and clears it with null, once chat is on", async () => {
    const me = await trainee();
    const other = await trainee();

    await ds.getRepository(User).update({ id: me.id }, { chatEnabled: true });
    const set = await call(app, "put", "/v1/users/me/chat-color", me.token, {
      color: "pink",
    });
    const profile = await call(app, "get", "/v1/users/me", me.token);

    expect(set.body).toEqual({ color: "pink" });
    expect(profile.body.chatColor).toBe("pink");
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: other.id }))
        .chatColor,
    ).toBeNull();
    const cleared = await call(
      app,
      "put",
      "/v1/users/me/chat-color",
      me.token,
      { color: null },
    );

    expect(cleared.body).toEqual({ color: null });
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: me.id })).chatColor,
    ).toBeNull();
  });

  it("refuses while chat is locked and rejects a colour outside the palette", async () => {
    const me = await trainee();
    const locked = await call(app, "put", "/v1/users/me/chat-color", me.token, {
      color: "pink",
    });

    expect(locked.status).toBe(403);
    expect(locked.body).toMatchObject({
      code: "CHAT_LOCKED",
      message: PROFILE_MESSAGES.CHAT_LOCKED,
    });
    await ds.getRepository(User).update({ id: me.id }, { chatEnabled: true });
    const bad = await call(app, "put", "/v1/users/me/chat-color", me.token, {
      color: "mauve",
    });

    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain(PROFILE_MESSAGES.COLOR_INVALID);
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: me.id })).chatColor,
    ).toBeNull();
  });
});

describe("PUT /v1/me/locale and /v1/me/bio for a trainee", () => {
  it("saves the language on the account", async () => {
    const me = await trainee();
    const response = await call(app, "put", "/v1/me/locale", me.token, {
      locale: "zh",
    });

    expect(response.body).toEqual({ locale: "zh" });
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: me.id })).locale,
    ).toBe("zh");
    expect(
      (await call(app, "put", "/v1/me/locale", me.token, { locale: "xx" }))
        .status,
    ).toBe(400);
    expect(
      (await call(app, "put", "/v1/me/locale", null, { locale: "en" })).status,
    ).toBe(401);
  });

  it("needs the accepted terms for a bio, trims it and clears it with an empty value", async () => {
    const plain = await trainee();
    const social = await trainee({}, true);
    const refused = await call(app, "put", "/v1/me/bio", plain.token, {
      bio: "hi",
    });

    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      code: "TERMS_REQUIRED",
      message: PROFILE_MESSAGES.TERMS_REQUIRED,
    });
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: plain.id })).bio,
    ).toBeNull();
    const saved = await call(app, "put", "/v1/me/bio", social.token, {
      bio: "  Lifter  ",
    });

    expect(saved.body).toEqual({ bio: "Lifter" });
    const cleared = await call(app, "put", "/v1/me/bio", social.token, {
      bio: "   ",
    });

    expect(cleared.body).toEqual({ bio: null });
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: social.id })).bio,
    ).toBeNull();
    const long = await call(app, "put", "/v1/me/bio", social.token, {
      bio: "x".repeat(151),
    });

    expect(long.status).toBe(400);
    expect(long.body.message).toContain(PROFILE_MESSAGES.BIO_TOO_LONG);
  });
});

describe("contact aliases", () => {
  it("stores the alias under the signed-in trainee for the PT side, an admin or a classmate", async () => {
    const me = await trainee({}, true);
    const mate = await trainee({}, true);
    const pt = await seedAdmin(ds, { role: "pt" });

    for (const [target, alias] of [
      ["pt", "Coach"],
      [`admin:${pt.id}`, "Boss"],
      [`user:${mate.id}`, "Buddy"],
    ] as const) {
      const response = await call(
        app,
        "put",
        `/v1/contact-aliases/${encodeURIComponent(target)}`,
        me.token,
        { alias },
      );

      expect(response.status, target).toBe(200);
      expect(response.body).toEqual({ targetKey: target, alias });
      expect((await aliasOf(`user:${me.id}`, target))?.alias).toBe(alias);
    }
    const list = await call(app, "get", "/v1/contact-aliases", me.token);

    expect(list.body).toEqual({
      aliases: {
        pt: "Coach",
        [`admin:${pt.id}`]: "Boss",
        [`user:${mate.id}`]: "Buddy",
      },
    });
    // The classmate sees nothing of it.
    expect(
      (await call(app, "get", "/v1/contact-aliases", mate.token)).body,
    ).toEqual({ aliases: {} });
  });

  it("trims, collapses spaces, replaces the previous value and enforces 30 characters", async () => {
    const me = await trainee();
    const put = (alias: string) =>
      call(app, "put", "/v1/contact-aliases/pt", me.token, { alias });

    expect((await put("  big   coach ")).body.alias).toBe("big coach");
    expect((await put("new")).body.alias).toBe("new");
    expect(
      await ds
        .getRepository(ContactAlias)
        .countBy({ ownerKey: `user:${me.id}` }),
    ).toBe(1);
    expect((await put("ê".repeat(30))).status).toBe(200);
    const tooLong = await put("ê".repeat(31));

    expect(tooLong.status).toBe(400);
    expect(tooLong.body).toMatchObject({
      code: "ALIAS_INVALID",
      message: ALIAS_MESSAGES.INVALID,
    });
    expect((await put("a\u0007b")).status).toBe(400);
    expect(
      (await call(app, "put", "/v1/contact-aliases/pt", me.token, {})).status,
    ).toBe(400);
  });

  it("refuses to name yourself and bad targets, and takes the owner from the session only", async () => {
    const me = await trainee();
    const self = await call(
      app,
      "put",
      `/v1/contact-aliases/user%3A${me.id}`,
      me.token,
      { alias: "Me" },
    );

    expect(self.status).toBe(400);
    expect(self.body).toMatchObject({
      code: "ALIAS_SELF",
      message: ALIAS_MESSAGES.SELF,
    });
    for (const target of ["nobody", "user%3A0", "user%3A1%3A2", "owner%3A5"]) {
      const bad = await call(
        app,
        "put",
        `/v1/contact-aliases/${target}`,
        me.token,
        { alias: "X" },
      );

      expect(bad.status, target).toBe(400);
      expect(bad.body.code).toBe("ALIAS_INVALID");
    }
    // An `ownerKey` smuggled in the body changes nothing.
    await call(app, "put", "/v1/contact-aliases/pt", me.token, {
      alias: "Mine",
      ownerKey: "user:999",
    });
    expect(
      await ds.getRepository(ContactAlias).countBy({ ownerKey: "user:999" }),
    ).toBe(0);
  });

  it("answers 'not found' for missing, blocked or not-yet-social targets", async () => {
    const me = await trainee({}, true);
    const missing = await call(
      app,
      "put",
      "/v1/contact-aliases/user%3A987654",
      me.token,
      { alias: "Ghost" },
    );
    const noTerms = await trainee();
    const notSocial = await call(
      app,
      "put",
      `/v1/contact-aliases/user%3A${noTerms.id}`,
      me.token,
      { alias: "Nope" },
    );
    const blocker = await trainee({}, true);

    await ds.getRepository(SocialBlock).save({
      blockerId: blocker.id,
      blockedId: me.id,
      createdAt: new Date(),
    });
    const blocked = await call(
      app,
      "put",
      `/v1/contact-aliases/user%3A${blocker.id}`,
      me.token,
      { alias: "Blocked" },
    );
    const noAdmin = await call(
      app,
      "put",
      "/v1/contact-aliases/admin%3A987654",
      me.token,
      { alias: "Ghost" },
    );

    for (const response of [missing, notSocial, blocked, noAdmin]) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: "ALIAS_TARGET_NOT_FOUND",
        message: ALIAS_MESSAGES.TARGET_NOT_FOUND,
      });
    }
    expect(
      await ds
        .getRepository(ContactAlias)
        .countBy({ ownerKey: `user:${me.id}` }),
    ).toBe(0);
  });

  it("clears with DELETE or an empty alias, even for an account that is gone", async () => {
    const me = await trainee();
    const gone = await trainee({}, true);

    await ds.getRepository(ContactAlias).save({
      ownerKey: `user:${me.id}`,
      targetKey: `user:${gone.id}`,
      alias: "Old",
      updatedAt: new Date(),
    });
    await ds.getRepository(User).delete({ id: gone.id });
    const emptied = await call(
      app,
      "put",
      `/v1/contact-aliases/user%3A${gone.id}`,
      me.token,
      { alias: "  " },
    );

    expect(emptied.body).toEqual({ targetKey: `user:${gone.id}`, alias: "" });
    expect(await aliasOf(`user:${me.id}`, `user:${gone.id}`)).toBeNull();
    await call(app, "put", "/v1/contact-aliases/pt", me.token, {
      alias: "Coach",
    });
    const removed = await call(
      app,
      "delete",
      "/v1/contact-aliases/pt",
      me.token,
    );

    expect(removed.status).toBe(204);
    expect(await aliasOf(`user:${me.id}`, "pt")).toBeNull();
    // Clearing what was never set is fine too.
    expect(
      (await call(app, "delete", "/v1/contact-aliases/pt", me.token)).status,
    ).toBe(204);
  });

  it("lets an admin name a trainee of their workspace, the super admin any, and is symmetric", async () => {
    const pt = await admin("pt");
    const boss = await admin("super_admin");
    const mine = await trainee({ ptAdminId: pt.id });
    const unassigned = await trainee();
    const ok = await call(
      app,
      "put",
      `/v1/contact-aliases/user%3A${mine.id}`,
      pt.token,
      { alias: "Champ" },
    );
    const superAny = await call(
      app,
      "put",
      `/v1/contact-aliases/user%3A${unassigned.id}`,
      boss.token,
      { alias: "Rookie" },
    );

    expect(ok.status).toBe(200);
    expect(superAny.status).toBe(200);
    expect((await aliasOf(`admin:${pt.id}`, `user:${mine.id}`))?.alias).toBe(
      "Champ",
    );
    // The trainee still sees the real name and no alias of the admin's.
    expect(
      (await call(app, "get", "/v1/contact-aliases", mine.token)).body,
    ).toEqual({ aliases: {} });
    const detail = await call(app, "get", `/v1/trainees/${mine.id}`, pt.token);

    expect(detail.body).toMatchObject({
      name: mine.name,
      displayName: "Champ",
    });
    const other = await call(app, "get", `/v1/trainees/${mine.id}`, boss.token);

    expect(other.body.displayName).toBe(mine.name);
  });

  it("refuses an admin a trainee outside the workspace, a hidden one and the PT side without saying why", async () => {
    const pt = await admin("pt");
    const otherPt = await seedAdmin(ds, { role: "pt" });
    const theirs = await trainee({ ptAdminId: otherPt.id });
    const hidden = await trainee({ ptAdminId: pt.id });
    const unassigned = await trainee();

    await hideTrainee(ds, pt.id, hidden.id);
    const results = await Promise.all([
      call(app, "put", `/v1/contact-aliases/user%3A${theirs.id}`, pt.token, {
        alias: "Spy",
      }),
      call(app, "put", `/v1/contact-aliases/user%3A${hidden.id}`, pt.token, {
        alias: "Hid",
      }),
      call(
        app,
        "put",
        `/v1/contact-aliases/user%3A${unassigned.id}`,
        pt.token,
        { alias: "Free" },
      ),
      call(app, "put", "/v1/contact-aliases/pt", pt.token, { alias: "Self" }),
    ]);

    for (const response of results) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("ALIAS_TARGET_NOT_FOUND");
    }
    expect(
      await ds
        .getRepository(ContactAlias)
        .countBy({ ownerKey: `admin:${pt.id}` }),
    ).toBe(0);
  });

  it("lets an admin name a colleague but never themselves", async () => {
    const pt = await admin("pt");
    const colleague = await seedAdmin(ds, { role: "super_admin" });
    const ok = await call(
      app,
      "put",
      `/v1/contact-aliases/admin%3A${colleague.id}`,
      pt.token,
      { alias: "Boss" },
    );
    const self = await call(
      app,
      "put",
      `/v1/contact-aliases/admin%3A${pt.id}`,
      pt.token,
      { alias: "Me" },
    );

    expect(ok.status).toBe(200);
    expect(self.status).toBe(400);
    expect(self.body.code).toBe("ALIAS_SELF");
  });

  it("answers 401 without a session", async () => {
    expect((await call(app, "get", "/v1/contact-aliases")).status).toBe(401);
    expect(
      (await call(app, "put", "/v1/contact-aliases/pt", null, { alias: "x" }))
        .status,
    ).toBe(401);
    expect((await call(app, "delete", "/v1/contact-aliases/pt")).status).toBe(
      401,
    );
  });
});
