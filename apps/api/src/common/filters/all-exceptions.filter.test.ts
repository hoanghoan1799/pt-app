import {
  type ArgumentsHost,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";

const run = (
  nodeEnv: "development" | "production",
  exception: unknown,
  headersSent = false,
) => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const logger = { error: vi.fn(), warn: vi.fn() };
  const host = {
    getType: () => "http",
    switchToHttp: () => ({
      getResponse: () => ({ status, json, headersSent }),
      getRequest: () => ({ method: "GET", url: "/v1/x" }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter({ NODE_ENV: nodeEnv }, logger).catch(exception, host);

  return {
    status,
    body: json.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
    logger,
  };
};

describe("AllExceptionsFilter", () => {
  const driverError = Object.assign(
    new Error('relation "users" does not exist (SELECT * FROM users)'),
    { code: "42P01" },
  );

  it("production: generic message and ref, real error only in the log", () => {
    const { status, body, logger } = run("production", driverError);

    expect(status).toHaveBeenCalledWith(500);
    expect(body).toEqual({
      code: "INTERNAL_ERROR",
      message: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
      ref: expect.stringMatching(/^[0-9a-f]{8}$/),
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ref: body?.ref, err: driverError }),
      expect.any(String),
    );
  });

  it("development: adds the real error", () => {
    const { body } = run("development", driverError);

    expect(body?.debug).toMatchObject({
      name: "Error",
      message: driverError.message,
    });
  });

  it("passes the application's own 4xx message and code through", () => {
    const { status, body, logger } = run(
      "production",
      new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "name: bad",
      }),
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(body).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "name: bad",
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("never exposes the message of a 5xx HttpException", () => {
    const { body } = run(
      "production",
      new ServiceUnavailableException("db password hunter2"),
    );

    expect(body?.message).toBe("Đã có lỗi xảy ra. Vui lòng thử lại sau.");
  });

  it("does not write when the response already started", () => {
    const { status } = run("production", driverError, true);

    expect(status).not.toHaveBeenCalled();
  });
});

describe("AllExceptionsFilter details", () => {
  it("passes flat primitive details of a 4xx and nothing nested", () => {
    const { body } = run(
      "production",
      new BadRequestException({
        code: "PASSCODE_WRONG",
        message: "Mã khoá không đúng",
        details: {
          attemptsLeft: 3,
          signedOut: false,
          nested: { a: 1 },
          list: [1],
        },
      }),
    );

    expect(body).toMatchObject({
      code: "PASSCODE_WRONG",
      details: { attemptsLeft: 3, signedOut: false },
    });
    expect(body?.details).not.toHaveProperty("nested");
    expect(body?.details).not.toHaveProperty("list");
  });

  it("never passes details on a 5xx", () => {
    const { body } = run(
      "production",
      new ServiceUnavailableException({
        code: "X",
        message: "boom",
        details: { secret: "scrypt$1$a$b" },
      }),
    );

    expect(body).not.toHaveProperty("details");
  });
});
