import { Writable } from "node:stream";

import { Controller, Get, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Logger, LoggerModule, PinoLogger } from "nestjs-pino";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  buildLoggerParams,
  REDACTED,
  resolveLogLevel,
} from "./logger.config.js";

describe("resolveLogLevel", () => {
  it("is info in development and test, warn in production", () => {
    expect(resolveLogLevel({ NODE_ENV: "development" })).toBe("info");
    expect(resolveLogLevel({ NODE_ENV: "test" })).toBe("info");
    expect(resolveLogLevel({ NODE_ENV: "production" })).toBe("warn");
  });

  it("lets LOG_LEVEL override both", () => {
    expect(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "debug" }),
    ).toBe("debug");
    expect(
      resolveLogLevel({ NODE_ENV: "development", LOG_LEVEL: "error" }),
    ).toBe("error");
  });
});

describe("buildLoggerParams", () => {
  it("uses pretty output only in development", () => {
    const pretty = (nodeEnv: "development" | "test" | "production") =>
      "transport" in
      (buildLoggerParams({ NODE_ENV: nodeEnv }).pinoHttp as object);

    expect(pretty("development")).toBe(true);
    expect(pretty("test")).toBe(false);
    expect(pretty("production")).toBe(false);
  });
});

@Controller("probe")
class ProbeController {
  constructor(private readonly logger: PinoLogger) {}

  @Get()
  get() {
    // What a service might log by mistake.
    this.logger.warn(
      {
        user: { password: "pw-in-object", token: "tok-in-object" },
        body: {
          currentPassword: "cur-pw-in-object",
          newPassword: "new-pw-in-object",
          currentPasscode: "cur-code-in-object",
          newPasscode: "new-code-in-object",
        },
        admin: {
          passwordHash: "pwhash-in-object",
          passcodeHash: "pchash-in-object",
        },
        session: {
          tokenHash: "tokhash-in-object",
          authorization: "Bearer in-object",
        },
      },
      "probe",
    );
    return { ok: true };
  }

  @Post()
  post() {
    return { echoed: "response-body-marker" };
  }
}

const bootWithCapturedLogs = async (nodeEnv: "test" | "production") => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const moduleRef = await Test.createTestingModule({
    imports: [
      LoggerModule.forRoot(
        buildLoggerParams({ NODE_ENV: nodeEnv, LOG_LEVEL: "info" }, stream),
      ),
    ],
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useLogger(app.get(Logger));
  await app.init();
  return { app, lines };
};

describe("log content", () => {
  it("redacts auth headers and secret fields, and never logs bodies", async () => {
    const { app, lines } = await bootWithCapturedLogs("production");

    await request(app.getHttpServer())
      .get("/probe")
      .set("Authorization", "Bearer bearer-secret")
      .set("Cookie", "sid=cookie-secret");
    await request(app.getHttpServer())
      .post("/probe")
      .send({ password: "request-body-marker" });
    await app.close();

    const text = lines.join("");

    expect(text).toContain(REDACTED);
    for (const secret of [
      "bearer-secret",
      "cookie-secret",
      "pw-in-object",
      "tok-in-object",
      "cur-pw-in-object",
      "new-pw-in-object",
      "cur-code-in-object",
      "new-code-in-object",
      "pwhash-in-object",
      "pchash-in-object",
      "tokhash-in-object",
      "Bearer in-object",
      "request-body-marker",
      "response-body-marker",
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});
