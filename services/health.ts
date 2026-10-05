import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { getTableName, sql } from "drizzle-orm";

import { ERROR_MESSAGES } from "@/constants/errors";
import { db } from "@/db";
import {
  admins,
  exerciseCompletions,
  exercises,
  users,
  workoutDays,
} from "@/db/schema";
import { describeDatabaseConfig, getSessionSecret } from "@/services/env";
import type { ClassifiedError } from "@/types/error";
import { AppError, classifyError } from "@/utils/errors";

type Check =
  | { status: "ok"; info?: string }
  | { status: "skipped"; reason: string }
  | ({ status: "error" } & ClassifiedError);

const REQUIRED_TABLES = [
  admins,
  users,
  workoutDays,
  exercises,
  exerciseCompletions,
].map((table) => getTableName(table));

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

const checkTables = async () => {
  const rows = await db.all<{ name: string }>(
    sql`select name from sqlite_master where type = 'table'`,
  );
  const tables = rows.map((row) => row.name);
  const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));

  if (missing.length) {
    throw new AppError("DB_NOT_MIGRATED", `Thiếu bảng: ${missing.join(", ")}`);
  }
  return `đủ ${REQUIRED_TABLES.length} bảng`;
};

const checkAdminAccount = async () => {
  const [{ total }] = await db.all<{ total: number }>(
    sql`select count(*) as total from ${admins}`,
  );

  if (!total) {
    throw new AppError(
      "CONFIG_MISSING",
      "Chưa có tài khoản admin nào (đặt ADMIN_USERNAME/ADMIN_PASSWORD rồi deploy lại, hoặc chạy npm run admin:create)",
    );
  }
  return `${total} admin`;
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
  const sessionSecret = await runCheck(() => {
    getSessionSecret();
    return undefined;
  });
  const databaseConfig = await runCheck(describeDatabaseConfig);
  const tables =
    databaseConfig.status === "ok"
      ? await runCheck(checkTables)
      : skipAfter("databaseConfig");
  const adminAccount =
    tables.status === "ok"
      ? await runCheck(checkAdminAccount)
      : skipAfter("tables");

  const checks: Record<string, Check> = {
    sessionSecret,
    databaseConfig,
    tables,
    adminAccount,
  };
  const problems = Object.entries(checks).flatMap(([name, check]) =>
    check.status === "error"
      ? [`${name}: ${ERROR_MESSAGES[check.code]} — ${check.detail}`]
      : [],
  );

  return { status: problems.length ? "error" : "ok", problems, checks };
};
