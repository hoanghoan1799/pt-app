import type { ErrorCode } from "@/types/error";

// The only text users see for unexpected errors in production; technical
// causes stay in the server logs (see services/action-errors.ts).
export const GENERIC_ERROR_MESSAGE = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";

export const ERROR_REFERENCE_LENGTH = 8;

// What went wrong, for developers: shown in development, the logs and the
// token-protected /api/health — never to users in production.
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CONFIG_MISSING: "Server chưa được cấu hình đủ biến môi trường",
  CONFIG_INVALID: "Biến môi trường trên server không hợp lệ",
  DB_FILE_UNAVAILABLE:
    "Database đang trỏ tới file SQLite, không dùng được trên Vercel",
  DB_NOT_MIGRATED: "Database chưa được tạo bảng (chạy npm run db:setup)",
  DB_AUTH_FAILED:
    "Server không đăng nhập được vào database (sai DATABASE_AUTH_TOKEN?)",
  DB_UNREACHABLE: "Server không kết nối được tới database",
  UNKNOWN: "Đã có lỗi không mong muốn trên server",
};

// Ordered: the first matching pattern decides the code.
export const DB_ERROR_PATTERNS: [ErrorCode, RegExp][] = [
  ["DB_NOT_MIGRATED", /no such table|no such column/i],
  [
    "DB_FILE_UNAVAILABLE",
    /SQLITE_CANTOPEN|unable to open database|EROFS|read-only file system/i,
  ],
  ["DB_AUTH_FAILED", /\b401\b|unauthori[sz]ed|invalid.*(token|jwt)|AUTH_/i],
  [
    "DB_UNREACHABLE",
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|SERVER_ERROR|URL_INVALID|network/i,
  ],
];

export const DEFAULT_LOCAL_DATABASE_URL = "file:local.db";

export const REQUIRED_ENV = {
  DATABASE_URL: "DATABASE_URL",
  SESSION_SECRET: "SESSION_SECRET",
} as const;
