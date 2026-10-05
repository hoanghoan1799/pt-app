import "server-only";

import { cookies } from "next/headers";

import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  USER_COOKIE,
  USER_SESSION_MAX_AGE,
} from "@/constants/session";
import {
  getSessionCookieOptions,
  signSession,
  verifySession,
} from "@/services/session-token";

const writeCookie = async (name: string, value: string, maxAge: number) => {
  const cookieStore = await cookies();

  cookieStore.set(name, value, getSessionCookieOptions(maxAge));
};

export const startUserSession = async (userId: number) => {
  const token = await signSession(
    { role: "user", userId },
    USER_SESSION_MAX_AGE,
  );

  await writeCookie(USER_COOKIE, token, USER_SESSION_MAX_AGE);
};

export const startAdminSession = async (adminId: number) => {
  const token = await signSession(
    { role: "admin", adminId },
    ADMIN_SESSION_MAX_AGE,
  );

  await writeCookie(ADMIN_COOKIE, token, ADMIN_SESSION_MAX_AGE);
};

export const endSession = async (cookieName: string) => {
  const cookieStore = await cookies();

  cookieStore.delete(cookieName);
};

export const readSession = async (cookieName: string) => {
  const cookieStore = await cookies();

  return verifySession(cookieStore.get(cookieName)?.value);
};
