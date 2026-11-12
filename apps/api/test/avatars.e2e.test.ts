import type { INestApplication } from "@nestjs/common";
import { AVATAR_MAX_BYTES, AVATAR_MESSAGES } from "@pt/contracts";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { Admin } from "../src/database/entities/admin.entity.js";
import { User } from "../src/database/entities/user.entity.js";
import { createTestApp } from "./support/app.js";
import {
  FakeClock,
  seedAdmin,
  seedConversation,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { call, PNG_BASE64, PNG_URL } from "./support/http.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let clock: FakeClock;

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

const trainee = async () => {
  const user = await seedUser(ds);

  return { ...user, token: await tokenOf(app, { kind: "user", ...user }) };
};

const admin = async () => {
  const row = await seedAdmin(ds, { role: "pt" });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

const jpegUrl = (bytes: number) =>
  `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, ...new Array(bytes - 3).fill(1)]).toString("base64")}`;

const versionOf = (url: string) =>
  new URL(url, "http://x").searchParams.get("v");

describe("PUT /v1/users/me/avatar", () => {
  it("stores the caller's own photo and returns its versioned URL", async () => {
    const me = await trainee();
    const other = await trainee();
    const response = await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });

    expect(response.status).toBe(200);
    expect(response.body.avatarUrl).toBe(
      `/v1/avatars/user/${me.id}?v=${Math.floor(clock.now().getTime() / 1000)}`,
    );
    const row = await ds.getRepository(User).findOneOrFail({
      where: { id: me.id },
      select: { id: true, avatar: true, avatarUpdatedAt: true },
    });

    expect(row.avatar).toBe(PNG_URL);
    expect(row.avatarUpdatedAt?.getTime()).toBe(
      Math.floor(clock.now().getTime() / 1000) * 1000,
    );
    // Only their own row.
    const untouched = await ds.getRepository(User).findOneOrFail({
      where: { id: other.id },
      select: { id: true, avatar: true },
    });

    expect(untouched.avatar).toBeNull();
  });

  it("accepts exactly 80 KB and rejects one byte more with the too-large message", async () => {
    const me = await trainee();
    const exact = await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: jpegUrl(AVATAR_MAX_BYTES),
    });
    const over = await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: jpegUrl(AVATAR_MAX_BYTES + 1),
    });

    expect(exact.status).toBe(200);
    expect(over.status).toBe(413);
    expect(over.body).toMatchObject({
      code: "AVATAR_TOO_LARGE",
      message: AVATAR_MESSAGES.TOO_LARGE,
    });
  });

  it("rejects non-images, wrong labels, bad shapes and an empty value without writing", async () => {
    const me = await trainee();
    const html = `data:image/png;base64,${Buffer.from("<script>1</script>").toString("base64")}`;
    const mislabeled = PNG_URL.replace("image/png", "image/jpeg");

    for (const dataUrl of [
      html,
      mislabeled,
      "nope",
      "",
      "data:image/gif;base64,R0lGODlh",
    ]) {
      const response = await call(app, "put", "/v1/users/me/avatar", me.token, {
        dataUrl,
      });

      expect(response.status, dataUrl.slice(0, 24)).toBe(400);
      expect(response.body).toMatchObject({
        code: "AVATAR_INVALID",
        message: AVATAR_MESSAGES.INVALID,
      });
    }
    const missing = await call(app, "put", "/v1/users/me/avatar", me.token, {});

    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("VALIDATION_FAILED");
    expect(
      (
        await ds.getRepository(User).findOneOrFail({
          where: { id: me.id },
          select: { id: true, avatar: true },
        })
      ).avatar,
    ).toBeNull();
  });

  it("refuses a body over the JSON limit with 413 and no stack", async () => {
    const me = await trainee();
    const response = await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: "a".repeat(300 * 1024),
    });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(response.body.ref).toEqual(expect.any(String));
  });

  it("needs a trainee session", async () => {
    const pt = await admin();

    expect(
      (
        await call(app, "put", "/v1/users/me/avatar", null, {
          dataUrl: PNG_URL,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(app, "put", "/v1/users/me/avatar", pt.token, {
          dataUrl: PNG_URL,
        })
      ).status,
    ).toBe(403);
  });
});

describe("PUT /v1/admins/me/avatar and removal", () => {
  it("stores on the admin row and clears both kinds", async () => {
    const pt = await admin();
    const me = await trainee();
    const set = await call(app, "put", "/v1/admins/me/avatar", pt.token, {
      dataUrl: PNG_URL,
    });

    expect(set.status).toBe(200);
    expect(set.body.avatarUrl).toMatch(
      new RegExp(`^/v1/avatars/admin/${pt.id}\\?v=\\d+$`),
    );
    expect(
      (
        await ds.getRepository(Admin).findOneOrFail({
          where: { id: pt.id },
          select: { id: true, avatar: true },
        })
      ).avatar,
    ).toBe(PNG_URL);
    expect(
      (
        await call(app, "put", "/v1/admins/me/avatar", me.token, {
          dataUrl: PNG_URL,
        })
      ).status,
    ).toBe(403);

    await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });
    const gone = await call(app, "delete", "/v1/users/me/avatar", me.token);
    const goneAdmin = await call(
      app,
      "delete",
      "/v1/admins/me/avatar",
      pt.token,
    );

    expect(gone.body).toEqual({ avatarUrl: null });
    expect(goneAdmin.body).toEqual({ avatarUrl: null });
    const row = await ds.getRepository(User).findOneOrFail({
      where: { id: me.id },
      select: { id: true, avatar: true, avatarUpdatedAt: true },
    });

    expect(row).toMatchObject({ avatar: null, avatarUpdatedAt: null });
    expect(
      (await call(app, "get", `/v1/avatars/user/${me.id}`, me.token)).status,
    ).toBe(404);
  });
});

describe("GET /v1/avatars/:kind/:id", () => {
  it("serves the bytes with the sniffed type and revalidating headers", async () => {
    const me = await trainee();

    await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });
    const response = await call(
      app,
      "get",
      `/v1/avatars/user/${me.id}`,
      me.token,
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("private, no-cache");
    expect(response.headers.etag).toMatch(/^"\d+"$/);
    expect(Buffer.from(response.body).toString("base64")).toBe(PNG_BASE64);
  });

  it("caches a year when ?v matches and revalidates when it does not", async () => {
    const me = await trainee();
    const set = await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });
    const version = versionOf(set.body.avatarUrl);
    const same = await call(
      app,
      "get",
      `/v1/avatars/user/${me.id}?v=${version}`,
      me.token,
    );
    const stale = await call(
      app,
      "get",
      `/v1/avatars/user/${me.id}?v=1`,
      me.token,
    );

    expect(same.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(stale.headers["cache-control"]).toBe("private, no-cache");
    expect(same.headers.etag).toBe(`"${version}"`);
  });

  it("answers 304 with the ETag on a matching If-None-Match", async () => {
    const me = await trainee();

    await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });
    const first = await call(app, "get", `/v1/avatars/user/${me.id}`, me.token);
    const cached = await call(
      app,
      "get",
      `/v1/avatars/user/${me.id}`,
      me.token,
    ).set("If-None-Match", first.headers.etag);
    const changed = await call(
      app,
      "get",
      `/v1/avatars/user/${me.id}`,
      me.token,
    ).set("If-None-Match", '"1"');

    expect(cached.status).toBe(304);
    expect(cached.headers.etag).toBe(first.headers.etag);
    expect(cached.body).toEqual({});
    expect(changed.status).toBe(200);
  });

  it("changes the version when the photo is replaced later", async () => {
    const me = await trainee();
    const first = await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });

    clock.advance(5000);
    const second = await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });

    expect(Number(versionOf(second.body.avatarUrl))).toBe(
      Number(versionOf(first.body.avatarUrl)) + 5,
    );
  });

  it("answers 401 without a session", async () => {
    const me = await trainee();

    expect((await call(app, "get", `/v1/avatars/user/${me.id}`)).status).toBe(
      401,
    );
  });

  it("shows a trainee their own photo, never another trainee's", async () => {
    const me = await trainee();
    const other = await trainee();

    await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });
    await call(app, "put", "/v1/users/me/avatar", other.token, {
      dataUrl: PNG_URL,
    });

    expect(
      (await call(app, "get", `/v1/avatars/user/${me.id}`, me.token)).status,
    ).toBe(200);
    const probe = await call(
      app,
      "get",
      `/v1/avatars/user/${other.id}`,
      me.token,
    );

    expect(probe.status).toBe(404);
    expect(probe.body.code).toBe("AVATAR_NOT_FOUND");
  });

  it("shows the PT team's photo only to a trainee with a conversation", async () => {
    const me = await trainee();
    const pt = await admin();

    await call(app, "put", "/v1/admins/me/avatar", pt.token, {
      dataUrl: PNG_URL,
    });

    expect(
      (await call(app, "get", `/v1/avatars/admin/${pt.id}`, me.token)).status,
    ).toBe(404);
    await seedConversation(ds, me.id);
    expect(
      (await call(app, "get", `/v1/avatars/admin/${pt.id}`, me.token)).status,
    ).toBe(200);
  });

  it("lets any admin see any photo, and 404s for missing photos, bad kinds and bad ids", async () => {
    const me = await trainee();
    const bare = await trainee();
    const pt = await admin();

    await call(app, "put", "/v1/users/me/avatar", me.token, {
      dataUrl: PNG_URL,
    });

    expect(
      (await call(app, "get", `/v1/avatars/user/${me.id}`, pt.token)).status,
    ).toBe(200);
    for (const path of [
      `/v1/avatars/user/${bare.id}`,
      "/v1/avatars/root/1",
      "/v1/avatars/user/abc",
      "/v1/avatars/user/-1",
      "/v1/avatars/user/0",
    ]) {
      expect((await call(app, "get", path, pt.token)).status, path).toBe(404);
    }
  });

  it("does not serve a stored value that is not an image", async () => {
    const me = await trainee();
    const pt = await admin();

    await ds.getRepository(User).update(
      { id: me.id },
      {
        avatar: "data:image/png;base64,PHNjcmlwdD4=",
        avatarUpdatedAt: new Date(),
      },
    );

    expect(
      (await call(app, "get", `/v1/avatars/user/${me.id}`, pt.token)).status,
    ).toBe(404);
  });
});
