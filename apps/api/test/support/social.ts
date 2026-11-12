import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DataSource } from "typeorm";

import { Clock } from "../../src/common/clock.js";
import { createTestApp } from "./app.js";
import { bearer, FakeClock, seedAdmin, seedUser, tokenOf } from "./auth.js";
import { createTestDatabase, type TestDatabase } from "./database.js";

// A valid 1x1 PNG (the API reads type and size from the bytes).
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export type SocialWorld = {
  db: TestDatabase;
  ds: DataSource;
  app: INestApplication;
  clock: FakeClock;
  ids: {
    superAdmin: number;
    ptA: number;
    ptB: number;
    // Trainees of PT A, PT A, PT A, PT B.
    ann: number;
    ben: number;
    cat: number;
    dan: number;
    // PT A, but never accepted the terms.
    noTerms: number;
    // A PT with a passcode ("4321") and their trainee, for hidden trainees.
    ptP: number;
    pat: number;
  };
  tokens: {
    superAdmin: string;
    ptA: string;
    ptB: string;
    ann: string;
    ben: string;
    cat: string;
    dan: string;
    noTerms: string;
    ptP: string;
    pat: string;
  };
  admins: { ptA: { username: string; password: string } };
};

export const acceptTerms = (ds: DataSource, userId: number) =>
  ds.query(
    `UPDATE users SET terms_version = 1, terms_accepted_at = now() WHERE id = $1`,
    [userId],
  );

export const createSocialWorld = async (): Promise<SocialWorld> => {
  const db = await createTestDatabase();
  const clock = new FakeClock();
  const app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: Clock, value: clock }],
  });
  const ds = db.dataSource;
  const superAdmin = await seedAdmin(ds, { role: "super_admin" });
  const ptA = await seedAdmin(ds, { role: "pt" });
  const ptB = await seedAdmin(ds, { role: "pt" });
  const ptP = await seedAdmin(ds, { role: "pt", passcode: "4321" });
  const users = {
    pat: await seedUser(ds, { name: "Pat", ptAdminId: ptP.id }),
    ann: await seedUser(ds, { name: "Ann", ptAdminId: ptA.id }),
    ben: await seedUser(ds, { name: "Ben", ptAdminId: ptA.id }),
    cat: await seedUser(ds, { name: "Cat", ptAdminId: ptA.id }),
    dan: await seedUser(ds, { name: "Dan", ptAdminId: ptB.id }),
    noTerms: await seedUser(ds, { name: "Nia", ptAdminId: ptA.id }),
  };

  for (const [name, user] of Object.entries(users)) {
    if (name !== "noTerms") {
      await acceptTerms(ds, user.id);
    }
  }
  const token = (user: (typeof users)[keyof typeof users]) =>
    tokenOf(app, { kind: "user", ...user });

  return {
    db,
    ds,
    app,
    clock,
    ids: {
      superAdmin: superAdmin.id,
      ptA: ptA.id,
      ptB: ptB.id,
      ann: users.ann.id,
      ben: users.ben.id,
      cat: users.cat.id,
      dan: users.dan.id,
      noTerms: users.noTerms.id,
      ptP: ptP.id,
      pat: users.pat.id,
    },
    tokens: {
      superAdmin: await tokenOf(app, { kind: "admin", ...superAdmin }),
      ptA: await tokenOf(app, { kind: "admin", ...ptA }),
      ptB: await tokenOf(app, { kind: "admin", ...ptB }),
      ann: await token(users.ann),
      ben: await token(users.ben),
      cat: await token(users.cat),
      dan: await token(users.dan),
      noTerms: await token(users.noTerms),
      ptP: await tokenOf(app, { kind: "admin", ...ptP }),
      pat: await token(users.pat),
    },
    admins: { ptA },
  };
};

export const destroySocialWorld = async (world: SocialWorld) => {
  await world.app.close();
  await world.db.drop();
};

export const social = (app: INestApplication) => {
  const call = (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    token?: string,
    body?: object,
    headers: Record<string, string> = {},
  ) => {
    const req = request(app.getHttpServer())[method](`/v1/social${path}`);

    if (token) {
      req.set(bearer(token));
    }
    req.set(headers);
    return body === undefined ? req : req.send(body);
  };

  return {
    get: (path: string, token?: string) => call("get", path, token),
    post: (path: string, token?: string, body: object = {}, headers = {}) =>
      call("post", path, token, body, headers),
    put: (path: string, token?: string, body: object = {}) =>
      call("put", path, token, body),
    patch: (path: string, token?: string, body: object = {}) =>
      call("patch", path, token, body),
    delete: (path: string, token?: string) => call("delete", path, token),
    upload: (token: string | undefined, bytes: Buffer) => {
      const req = request(app.getHttpServer())
        .post("/v1/social/photos")
        .set("Content-Type", "image/png");

      if (token) {
        req.set(bearer(token));
      }
      return req.send(bytes);
    },
  };
};

// Two trainees become friends (a row, smaller id first).
export const befriend = (ds: DataSource, a: number, b: number) =>
  ds.query(
    `INSERT INTO social_friendships (user_low, user_high, status, requested_by, created_at, accepted_at)
     VALUES ($1, $2, 'accepted', $3, now(), now())`,
    [Math.min(a, b), Math.max(a, b), a],
  );

// An admin with a passcode: unlock the session, then optionally reveal hidden
// trainees.
export const unlockAdmin = (
  app: INestApplication,
  token: string,
  passcode: string,
) =>
  request(app.getHttpServer())
    .post("/v1/admins/me/passcode/verify")
    .set(bearer(token))
    .send({ passcode });

export const revealHidden = async (
  app: INestApplication,
  token: string,
  passcode: string,
) => {
  await unlockAdmin(app, token, passcode);
  const response = await request(app.getHttpServer())
    .post("/v1/admins/me/hidden-users/reveal")
    .set(bearer(token))
    .send({ passcode });

  if (response.body.revealed !== true) {
    throw new Error("Reveal failed");
  }
};

export const hide = (ds: DataSource, adminId: number, userId: number) =>
  ds.query(`INSERT INTO admin_hidden_users (admin_id, user_id) VALUES ($1, $2)`, [
    adminId,
    userId,
  ]);

export const count = async (ds: DataSource, sql: string, params: unknown[] = []) =>
  (await ds.query(sql, params))[0].count as number;
