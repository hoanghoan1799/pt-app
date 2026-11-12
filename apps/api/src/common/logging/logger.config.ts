import { randomUUID } from "node:crypto";

import type { Params } from "nestjs-pino";
import type { DestinationStream } from "pino";

import type { Env } from "../../config/env.schema.js";

// Field names that must never reach a log line, at any of the first four
// nesting levels (pino wildcards match one level each).
const SECRET_FIELDS = ["password", "passcode", "token", "secret"] as const;

const nested = (field: string) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  `*.*.*.${field}`,
];

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  ...SECRET_FIELDS.flatMap(nested),
  // A driver error carries the bound query parameters (password hashes...).
  "err.parameters",
  "*.err.parameters",
];

export const REDACTED = "[Redacted]";

type LogEnv = Pick<Env, "NODE_ENV" | "LOG_LEVEL">;

// Production is quiet by default (warn and up); LOG_LEVEL overrides either way.
export const resolveLogLevel = (env: LogEnv) =>
  env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "warn" : "info");

// A client may send its own request id; accept it only if it is a plain token.
const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

// Request lines carry method, url and headers (secrets redacted) and never a
// request or response body: pino-http does not serialize bodies and nothing
// here adds one.
export const buildLoggerParams = (
  env: LogEnv,
  stream?: DestinationStream,
): Params => {
  const options = {
    level: resolveLogLevel(env),
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    genReqId: (req: { headers: Record<string, unknown> }) => {
      const given = req.headers["x-request-id"];

      return typeof given === "string" && REQUEST_ID_PATTERN.test(given)
        ? given
        : randomUUID();
    },
    customLogLevel: (_req: unknown, res: { statusCode: number }) => {
      if (res.statusCode >= 500) {
        return "error" as const;
      }

      return res.statusCode >= 400 ? ("warn" as const) : ("info" as const);
    },
    // Probes would drown everything else.
    autoLogging: {
      ignore: (req: { url?: string }) => req.url === "/v1/health",
    },
    // Readable output only in development; JSON lines everywhere else.
    ...(env.NODE_ENV === "development" && !stream
      ? {
          transport: {
            target: "pino-pretty",
            options: { singleLine: true, colorize: true },
          },
        }
      : {}),
  };

  return { pinoHttp: stream ? [options, stream] : options };
};
