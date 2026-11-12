import type { INestApplication } from "@nestjs/common";
import { Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { getLoggerToken } from "nestjs-pino";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";
import { createTestApp } from "./support/app.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

const bodySchema = z.object({ name: z.string().min(2) });

// Routes that fail in the ways a real feature module will.
@Controller("boom")
class BoomController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get("sql")
  sql() {
    return this.dataSource.query(
      `SELECT secret_column FROM secret_table WHERE password_hash = 'hunter2'`,
    );
  }

  @Get("entity")
  entity() {
    throw new Error(`failed for user ${JSON.stringify({ name: "An Nguyen" })}`);
  }

  @Get("missing")
  missing() {
    throw new NotFoundException("Bài tập không tồn tại");
  }

  @Post("validate")
  validate(@Body({ schema: bodySchema }) body: z.infer<typeof bodySchema>) {
    return body;
  }
}

type LogCall = { level: "error" | "warn"; fields: Record<string, unknown> };

const bootWith = async (
  db: TestDatabase,
  nodeEnv: "development" | "production",
) => {
  const calls: LogCall[] = [];
  const logger = {
    error: (fields: Record<string, unknown>) =>
      calls.push({ level: "error", fields }),
    warn: (fields: Record<string, unknown>) =>
      calls.push({ level: "warn", fields }),
  };
  const app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv,
    controllers: [BoomController],
    // Capture what the filter logs server-side.
    overrideProviders: [
      { token: getLoggerToken(AllExceptionsFilter.name), value: logger },
    ],
  });

  return { app, calls };
};

describe("error filter in production", () => {
  let db: TestDatabase;
  let app: INestApplication;
  let calls: LogCall[];

  beforeAll(async () => {
    db = await createTestDatabase();
    ({ app, calls } = await bootWith(db, "production"));
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it("hides SQL and driver text, keeps them in the log under the same ref", async () => {
    const response = await request(app.getHttpServer()).get("/v1/boom/sql");
    const raw = JSON.stringify(response.body);

    expect(response.status).toBe(500);
    expect(Object.keys(response.body).sort()).toEqual([
      "code",
      "message",
      "ref",
    ]);
    expect(response.body).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
    });
    expect(response.body.ref).toMatch(/^[0-9a-f-]{8}$/);

    for (const leak of [
      "secret_table",
      "secret_column",
      "hunter2",
      "relation",
      "QueryFailedError",
      "stack",
      "node_modules",
    ]) {
      expect(raw).not.toContain(leak);
    }

    const logged = calls.find((call) => call.fields.ref === response.body.ref);

    expect(logged?.level).toBe("error");
    expect(String((logged?.fields.err as Error).message)).toContain(
      "secret_table",
    );
  });

  it("hides the message of an unexpected error that carries entity data", async () => {
    const response = await request(app.getHttpServer()).get("/v1/boom/entity");

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("An Nguyen");
  });

  it("keeps the message and code of a deliberate client error", async () => {
    const response = await request(app.getHttpServer()).get("/v1/boom/missing");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Bài tập không tồn tại",
    });
    expect(response.body).not.toHaveProperty("debug");
  });

  it("reports validation failures as 400 without echoing the input", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/boom/validate")
      .send({ name: "x" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_FAILED");
    expect(response.body.message).toContain("name");
    expect(response.body.message).not.toContain('"x"');
  });
});

describe("error filter in development", () => {
  let db: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    db = await createTestDatabase();
    ({ app } = await bootWith(db, "development"));
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it("adds the real error to the response", async () => {
    const response = await request(app.getHttpServer()).get("/v1/boom/sql");

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(response.body.debug.message).toContain("secret_table");
    expect(response.body.debug.stack).toContain("Error");
  });
});
