import type { INestApplication } from "@nestjs/common";
import { Controller, Get } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Public } from "../src/auth/decorators/index.js";
import { createSuperAdmin } from "../src/scripts/create-super-admin.js";
import { createTestApp } from "./support/app.js";
import {
  bearer,
  loginAdmin,
  loginUser,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

@Public()
@Controller("boom")
class BoomController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get("sql")
  sql() {
    return this.dataSource.query(
      `SELECT password_hash, passcode_hash FROM no_such_table WHERE token_hash = 'scrypt$16384$salt$hash'`,
    );
  }

  @Get("leak")
  leak() {
    throw new Error("failed for scrypt$16384$c2FsdA==$aGFzaA== token Zm9v");
  }
}

describe("throttling on the credential routes", () => {
  let db: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = await createTestApp({
      databaseUrl: db.url,
      nodeEnv: "test",
      env: { LOGIN_THROTTLE_LIMIT: "3" },
    });
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it("answers 429 after the limit, in the common error format, whoever the account is", async () => {
    const wrong = { email: "a@example.com", password: "wrong-password-1" };

    for (let i = 0; i < 3; i++) {
      expect((await loginUser(app, wrong)).status).toBe(401);
    }

    const limited = await loginUser(app, {
      email: "other@example.com",
      password: "wrong-password-1",
    });

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      ref: expect.any(String),
    });
    expect(limited.body.message).toBeTruthy();
    expect(limited.body.code).toBe("TOO_MANY_REQUESTS");
    // The admin login route has its own counter.
    expect(
      (await loginAdmin(app, { username: "ghost", password: "wrong-pw-1" }))
        .status,
    ).toBe(401);
  });

  it("leaves every other route alone", async () => {
    for (let i = 0; i < 6; i++) {
      expect(
        (await request(app.getHttpServer()).get("/v1/health")).status,
      ).toBe(200);
    }
    expect((await request(app.getHttpServer()).get("/v1/auth/me")).status).toBe(
      401,
    );
  });
});

describe("production responses", () => {
  let db: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = await createTestApp({
      databaseUrl: db.url,
      nodeEnv: "production",
      controllers: [BoomController],
    });
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  const FORBIDDEN_TEXT = [
    "scrypt$",
    "passwordHash",
    "passcodeHash",
    "tokenHash",
    "password_hash",
    "passcode_hash",
    "token_hash",
    "no_such_table",
    "QueryFailedError",
    "stack",
    "node_modules",
    "debug",
  ];

  const expectClean = (response: request.Response) => {
    const raw = JSON.stringify(response.body);

    for (const leak of FORBIDDEN_TEXT) {
      expect(raw, `"${leak}" in ${raw}`).not.toContain(leak);
    }
    expect(
      Object.keys(response.body).every((key) =>
        ["code", "message", "ref", "details"].includes(key),
      ),
    ).toBe(true);
    expect(response.body.ref).toMatch(/^[0-9a-f-]{8}$/);
  };

  it("never includes hashes or internals in an error, 4xx or 5xx", async () => {
    const admin = await seedAdmin(db.dataSource, { passcode: "1234" });
    const user = await seedUser(db.dataSource);
    const adminToken = await tokenOf(app, { kind: "admin", ...admin });
    const http = request(app.getHttpServer());
    const responses = [
      await http.get("/v1/boom/sql"),
      await http.get("/v1/boom/leak"),
      await loginUser(app, { email: user.email, password: "wrong-password-1" }),
      await loginAdmin(app, {
        username: admin.username,
        password: "wrong-pw-1",
      }),
      await http.post("/v1/auth/login").send({ email: 5 }),
      await http.get("/v1/auth/me").set(bearer("A".repeat(43))),
      await http
        .post("/v1/admins/me/passcode/verify")
        .set(bearer(adminToken))
        .send({ passcode: "0000" }),
      await http
        .put("/v1/admins/me/passcode")
        .set(bearer(adminToken))
        .send({ passcode: "9999" }),
      await http.get("/v1/does-not-exist"),
    ];

    for (const response of responses) {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expectClean(response);
    }
    expect(responses[0].status).toBe(500);
    expect(responses[1].status).toBe(500);
    expect(responses[0].body.message).not.toContain("password");
  });

  it("never includes a hash or the passcode in a success body either", async () => {
    const admin = await seedAdmin(db.dataSource, { passcode: "8642" });
    const login = await loginAdmin(app, admin);
    const http = request(app.getHttpServer());
    const unlock = await http
      .post("/v1/admins/me/passcode/verify")
      .set(bearer(login.body.token))
      .send({ passcode: "8642" });
    const me = await http.get("/v1/auth/me").set(bearer(login.body.token));
    const sessions = await http
      .get("/v1/auth/sessions")
      .set(bearer(login.body.token));

    for (const response of [login, unlock, me, sessions]) {
      const raw = JSON.stringify(response.body);

      for (const leak of ["scrypt$", "Hash", "8642"]) {
        expect(raw).not.toContain(leak);
      }
    }
  });

  it("does not serve Swagger in production", async () => {
    expect(
      (await request(app.getHttpServer()).get("/v1/docs-json")).status,
    ).toBe(404);
  });
});

describe("admin:create (createSuperAdmin)", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  it("creates the first super admin, who can then sign in", async () => {
    const result = await createSuperAdmin(db.dataSource, {
      username: " Owner.One ",
      password: "a-long-owner-password",
    });
    const app = await createTestApp({ databaseUrl: db.url, nodeEnv: "test" });

    expect(result).toBe("created");

    const login = await loginAdmin(app, {
      username: "owner.one",
      password: "a-long-owner-password",
    });

    expect(login.status).toBe(200);
    expect(login.body.actor).toMatchObject({
      username: "Owner.One",
      role: "super_admin",
      verified: true,
    });
    await app.close();
  });

  it("never overwrites an existing admin, whatever the case of the name", async () => {
    const before = await db.dataSource.query(
      `SELECT id, username, password_hash, role FROM admins WHERE username_key = 'owner.one'`,
    );
    const again = await createSuperAdmin(db.dataSource, {
      username: "OWNER.ONE",
      password: "a-different-password-9",
    });
    const after = await db.dataSource.query(
      `SELECT id, username, password_hash, role FROM admins WHERE username_key = 'owner.one'`,
    );

    expect(again).toBe("exists");
    expect(after).toEqual(before);
    expect(await db.dataSource.query(`SELECT 1 FROM admins`)).toHaveLength(1);
  });

  it("rejects a bad username or a short password without touching the table", async () => {
    await expect(
      createSuperAdmin(db.dataSource, {
        username: "a b",
        password: "long-enough-1",
      }),
    ).rejects.toThrow(/SUPER_ADMIN_USERNAME/);
    await expect(
      createSuperAdmin(db.dataSource, {
        username: "valid.name",
        password: "short",
      }),
    ).rejects.toThrow(/SUPER_ADMIN_PASSWORD/);
    expect(await db.dataSource.query(`SELECT 1 FROM admins`)).toHaveLength(1);
  });
});
