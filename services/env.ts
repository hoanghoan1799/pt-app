import { DEFAULT_LOCAL_DATABASE_URL, REQUIRED_ENV } from "@/constants/errors";
import { MIN_SESSION_SECRET_LENGTH } from "@/constants/session";
import { AppError } from "@/utils/errors";

// Vercel sets VERCEL=1 on every build and function.
const isVercel = () => Boolean(process.env.VERCEL);

const readEnv = (name: string) => process.env[name]?.trim() || undefined;

// The Vercel ↔ Turso integration injects TURSO_DATABASE_URL/TURSO_AUTH_TOKEN;
// DATABASE_URL/DATABASE_AUTH_TOKEN are the names used locally. The Turso pair
// wins so a stale DATABASE_URL (e.g. copied from .env.example) can't shadow it.
export const getDatabaseConfig = () => {
  const url = readEnv("TURSO_DATABASE_URL") ?? readEnv("DATABASE_URL");
  const authToken =
    readEnv("TURSO_AUTH_TOKEN") ?? readEnv("DATABASE_AUTH_TOKEN");

  if (!url) {
    if (isVercel()) {
      throw new AppError(
        "CONFIG_MISSING",
        `Thiếu TURSO_DATABASE_URL (hoặc ${REQUIRED_ENV.DATABASE_URL}) — kết nối database Turso trong Vercel → Storage`,
      );
    }
    return { url: DEFAULT_LOCAL_DATABASE_URL, authToken: undefined };
  }

  if (isVercel() && url.startsWith("file:")) {
    throw new AppError(
      "DB_FILE_UNAVAILABLE",
      `Database URL "${url}" là file SQLite; Vercel không có ổ đĩa ghi được, hãy dùng Turso (libsql://…)`,
    );
  }

  if (isVercel() && !authToken) {
    throw new AppError(
      "CONFIG_MISSING",
      "Thiếu TURSO_AUTH_TOKEN (hoặc DATABASE_AUTH_TOKEN) để đăng nhập vào database Turso",
    );
  }
  return { url, authToken };
};

// Scheme and host only, never credentials or query parameters.
export const describeDatabaseConfig = () => {
  const { url, authToken } = getDatabaseConfig();
  const { protocol, host, pathname } = new URL(url);

  return `${protocol}//${host || pathname}${authToken ? " (có auth token)" : ""}`;
};

export const getSessionSecret = () => {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new AppError(
      "CONFIG_MISSING",
      `Thiếu biến môi trường ${REQUIRED_ENV.SESSION_SECRET}`,
    );
  }
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new AppError(
      "CONFIG_INVALID",
      `${REQUIRED_ENV.SESSION_SECRET} cần ít nhất ${MIN_SESSION_SECRET_LENGTH} ký tự (hiện có ${secret.length})`,
    );
  }
  return secret;
};
