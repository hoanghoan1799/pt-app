import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { ERROR_MESSAGES } from "@/constants/errors";
import { runApi } from "@/services/api/call";
import { getApiUrl } from "@/services/env";
import type { ClassifiedError } from "@/types/error";
import { classifyError } from "@/utils/errors";

type Check =
  | { status: "ok"; info?: string }
  | { status: "skipped"; reason: string }
  | ({ status: "error" } & ClassifiedError);

const runCheck = async (
  check: () => Promise<string | undefined> | string | undefined,
) => {
  try {
    return { status: "ok", info: await check() } satisfies Check;
  } catch (error) {
    return { status: "error", ...classifyError(error) } satisfies Check;
  }
};

// A check that can't run because an earlier one failed.
const skipAfter = (name: string): Check => ({
  status: "skipped",
  reason: `${name} lỗi`,
});

// The API answers GET /v1/health with its own database ping (503 when the
// database is down), so this app never opens a database itself.
const checkApi = async () => {
  const outcome = await runApi("none", (api) => api.GET("/v1/health"));

  if (!outcome.ok) {
    // Classified as API_UNREACHABLE / API_TIMEOUT, or UNKNOWN with the status
    // (503 means the API is up but its database is not).
    throw outcome.error;
  }
  return `API: ${outcome.data.status}, db ${outcome.data.db}`;
};

const MIN_HEALTH_TOKEN_LENGTH = 16;

const hashToken = (value: string) =>
  createHash("sha256").update(value).digest();

export const canViewHealthDetails = (token: string | null) => {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const expected = process.env.HEALTH_CHECK_TOKEN ?? "";

  return (
    expected.length >= MIN_HEALTH_TOKEN_LENGTH &&
    Boolean(token) &&
    timingSafeEqual(hashToken(token ?? ""), hashToken(expected))
  );
};

export const checkHealth = async () => {
  const apiUrl = await runCheck(() => {
    getApiUrl();
    return undefined;
  });
  const api =
    apiUrl.status === "ok" ? await runCheck(checkApi) : skipAfter("apiUrl");
  const checks: Record<string, Check> = { apiUrl, api };
  const problems = Object.entries(checks).flatMap(([name, check]) =>
    check.status === "error"
      ? [`${name}: ${ERROR_MESSAGES[check.code]} — ${check.detail}`]
      : [],
  );

  return { status: problems.length ? "error" : "ok", problems, checks };
};
