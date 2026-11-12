import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./support/app.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

describe("Swagger", () => {
  let db: TestDatabase;
  let devApp: INestApplication;
  let prodApp: INestApplication;

  beforeAll(async () => {
    db = await createTestDatabase();
    devApp = await createTestApp({ databaseUrl: db.url, nodeEnv: "test" });
    prodApp = await createTestApp({
      databaseUrl: db.url,
      nodeEnv: "production",
    });
  });

  afterAll(async () => {
    await devApp.close();
    await prodApp.close();
    await db.drop();
  });

  it("serves the UI and the document at /v1/docs outside production", async () => {
    const ui = await request(devApp.getHttpServer()).get("/v1/docs");
    const json = await request(devApp.getHttpServer()).get("/v1/docs-json");

    expect(ui.status).toBe(200);
    expect(json.status).toBe(200);
    expect(
      json.body.paths["/v1/health"].get.responses["200"].content[
        "application/json"
      ].schema.properties,
    ).toHaveProperty("db");
  });

  it("is not mounted in production", async () => {
    const ui = await request(prodApp.getHttpServer()).get("/v1/docs");
    const json = await request(prodApp.getHttpServer()).get("/v1/docs-json");

    expect(ui.status).toBe(404);
    expect(json.status).toBe(404);
  });
});
