import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  USER_COOKIE,
  USER_SESSION_MAX_AGE,
} from "@/constants/session";
import type { SessionRole } from "@/types/session";

// Pure helpers (no `next/headers`, no `server-only`) so the proxy, route
// handlers and unit tests share one definition of the session cookie.
//
// The cookie value is the opaque API session token. It is httpOnly, so no
// script in the browser can read it; the web server forwards it to the API as
// `Authorization: Bearer <token>`.

export const getSessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export const cookieNameFor = (role: SessionRole) =>
  role === "admin" ? ADMIN_COOKIE : USER_COOKIE;

// Same length as the API session (apps/api/src/auth/session-rules.ts):
// trainees 400 days, admins 7 days.
export const maxAgeFor = (role: SessionRole) =>
  role === "admin" ? ADMIN_SESSION_MAX_AGE : USER_SESSION_MAX_AGE;

export const sessionCookieFor = (role: SessionRole, token: string) => ({
  name: cookieNameFor(role),
  value: token,
  options: getSessionCookieOptions(maxAgeFor(role)),
});
