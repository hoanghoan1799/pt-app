import type { INestApplication } from "@nestjs/common";
import { getDataSourceToken } from "@nestjs/typeorm";
import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./support/app.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

describe("GET /v1/health", () => {
  let db: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = await createTestApp({ databaseUrl: db.url, nodeEnv: "test" });
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it("returns ok with the database ping", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", db: "ok" });
  });

  it("does not serve the health route without the version prefix", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(404);
  });

  it("answers an unknown /v1 route with the standard error body", async () => {
    const response = await request(app.getHttpServer()).get("/v1/nope");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "NOT_FOUND" });
    expect(response.body.ref).toMatch(/^[0-9a-f]{8}$/);
  });

  it("answers 503 with db down and no error text when the database is gone", async () => {
    const dyingDb = await createTestDatabase();
    const dyingApp = await createTestApp({
      databaseUrl: dyingDb.url,
      nodeEnv: "production",
    });

    try {
      // Closing the pool makes every query fail, like a database outage.
      await dyingApp.get<DataSource>(getDataSourceToken()).destroy();

      const response = await request(dyingApp.getHttpServer()).get(
        "/v1/health",
      );

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: "error", db: "down" });
    } finally {
      await dyingApp.close();
      await dyingDb.drop();
    }
  });
});
