import { randomUUID } from "node:crypto";

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import type { Response } from "express";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";

import { APP_ENV } from "../../config/app-config.module.js";
import type { Env } from "../../config/env.schema.js";

// Same text and reference length as apps/web/constants/errors.ts, so users see
// one message whichever side failed.
export const GENERIC_ERROR_MESSAGE = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
export const ERROR_REFERENCE_LENGTH = 8;

export type ErrorBody = {
  code: string;
  message: string;
  // Id of the log line that holds the real cause.
  ref: string;
  // Development only: the real error.
  debug?: { name: string; message: string; stack?: string };
};

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE",
  429: "TOO_MANY_REQUESTS",
};

const textOf = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) && value.every((v) => typeof v === "string")
    ? value.join("; ")
    : undefined;
};

// What a client may read from an HttpException below 500: the message and code
// the application chose. Anything else (and every 5xx) becomes the generic text.
const describeHttpException = (exception: HttpException) => {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const fields =
    typeof response === "object" && response !== null
      ? (response as Record<string, unknown>)
      : {};
  const code =
    typeof fields.code === "string"
      ? fields.code
      : (STATUS_CODES[status] ?? `HTTP_${status}`);
  const message = textOf(response) ?? textOf(fields.message);

  return { status, code, message };
};

// The single place errors become responses: `{ code, message, ref }`. Production
// never shows a stack, SQL, driver text or entity data; those only go to the
// server log together with the same `ref`.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly isProduction: boolean;

  constructor(
    @Inject(APP_ENV) env: Pick<Env, "NODE_ENV">,
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: Pick<PinoLogger, "error" | "warn">,
  ) {
    this.isProduction = env.NODE_ENV === "production";
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== "http") {
      this.logger.error({ err: exception }, "Unhandled non-HTTP exception");
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; url?: string }>();
    const ref = randomUUID().slice(0, ERROR_REFERENCE_LENGTH);

    const http =
      exception instanceof HttpException
        ? describeHttpException(exception)
        : undefined;
    const status = http?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const isClientError = status < 500;
    const code = http?.code ?? "INTERNAL_ERROR";
    const message =
      isClientError && http?.message ? http.message : GENERIC_ERROR_MESSAGE;

    const context = {
      ref,
      code,
      status,
      method: request.method,
      url: request.url,
    };

    if (isClientError) {
      this.logger.warn(context, "Request rejected");
    } else {
      this.logger.error({ ...context, err: exception }, "Request failed");
    }

    const body: ErrorBody = { code, message, ref };

    if (!this.isProduction && exception instanceof Error) {
      body.debug = {
        name: exception.name,
        message: exception.message,
        stack: exception.stack,
      };
    }

    if (response.headersSent) {
      return;
    }
    response.status(status).json(body);
  }
}
