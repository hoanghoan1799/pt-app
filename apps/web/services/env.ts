import { DEFAULT_LOCAL_DATABASE_URL, REQUIRED_ENV } from "@/constants/errors";
import { MIN_SESSION_SECRET_LENGTH } from "@/constants/session";
import { AppError } from "@/utils/errors";

// Vercel sets VERCEL=1 on every build and function.
const isVercel = () => Boolean(process.env.VERCEL);

const readEnv = (name: string) => process.env[name]?.trim() || undefined;

// Base URL of the NestJS API the web server calls server-to-server (BFF).
// Server only, never NEXT_PUBLIC_: browsers talk to this web app, not the API
// (except the Socket.IO connection, which uses a ticket). Defaults to the local
// API outside production; a deployed web app must set it.
export const DEFAULT_LOCAL_API_URL = "http://localhost:4000";

export const getApiUrl = () => {
  const value = readEnv("API_URL");

  if (!value) {
    if (isVercel() || process.env.NODE_ENV === "production") {
      throw new AppError(
        "CONFIG_MISSING",
        `Thiếu biến môi trường ${REQUIRED_ENV.API_URL}`,
      );
    }
    return DEFAULT_LOCAL_API_URL;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new AppError(
      "CONFIG_INVALID",
      `${REQUIRED_ENV.API_URL} không phải là một URL hợp lệ`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError(
      "CONFIG_INVALID",
      `${REQUIRED_ENV.API_URL} phải bắt đầu bằng http:// hoặc https://`,
    );
  }
  // No trailing slash: paths from the OpenAPI schema start with "/v1/…".
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
};

// The API address the BROWSER uses for the Socket.IO connection (the only
// thing it talks to the API for; everything else goes through this app). Read
// on the server and handed to the browser with the realtime ticket, so it needs
// no rebuild. Defaults to the local API outside production; in production an
// unset value gives "" and chat polls only.
export const getPublicApiUrl = () => {
  const value = readEnv("NEXT_PUBLIC_API_URL");

  if (!value) {
    return process.env.NODE_ENV === "production" || isVercel()
      ? ""
      : DEFAULT_LOCAL_API_URL;
  }
  try {
    const parsed = new URL(value);

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : "";
  } catch {
    return "";
  }
};

// Web Push (VAPID). Optional: without all three server values push is skipped.
// The public key may also be set as NEXT_PUBLIC_VAPID_PUBLIC_KEY (inlined into
// the browser bundle at build time).
export const getVapidPublicKey = () =>
  readEnv("VAPID_PUBLIC_KEY") ?? readEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY");

export const getVapidConfig = () => {
  const publicKey = getVapidPublicKey();
  const privateKey = readEnv("VAPID_PRIVATE_KEY");
  const subject = readEnv("VAPID_SUBJECT");

  return publicKey && privateKey && subject
    ? { publicKey, privateKey, subject }
    : null;
};

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

// The super admin (P1) created by `pnpm db:setup` / `pnpm admin:create`.
// SUPER_ADMIN_* win; the older ADMIN_* names are still read when they are
// missing, so an existing deployment keeps working until it is renamed.
export const getSuperAdminCredentials = () => ({
  username: readEnv("SUPER_ADMIN_USERNAME") ?? readEnv("ADMIN_USERNAME") ?? "",
  // The password is not trimmed: leading/trailing spaces may be intended.
  password:
    process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "",
});
