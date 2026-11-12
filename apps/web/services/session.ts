import "server-only";

import { cookies } from "next/headers";

import { cookieNameFor, sessionCookieFor } from "@/services/session-cookie";
import type { SessionRole } from "@/types/session";

// The session is the opaque API token in an httpOnly cookie (see
// services/session-cookie.ts and services/api/README.md). Who the token
// belongs to, and whether the admin is locked, is asked from the API
// (GET /v1/auth/me, see services/api/me.ts), never decoded here.

// Writes the token the API returned from a login. Server actions and route
// handlers only (server components cannot set cookies).
export const startSession = async (role: SessionRole, token: string) => {
  const cookieStore = await cookies();
  const { name, value, options } = sessionCookieFor(role, token);

  cookieStore.set(name, value, options);
};

export const endSession = async (cookieName: string) => {
  const cookieStore = await cookies();

  cookieStore.delete(cookieName);
};

export const readSessionToken = async (role: SessionRole) => {
  const cookieStore = await cookies();

  return cookieStore.get(cookieNameFor(role))?.value || undefined;
};
