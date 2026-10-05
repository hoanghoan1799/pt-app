import { type NextRequest, NextResponse } from "next/server";

import { ROUTES } from "@/constants/routes";
import {
  ADMIN_COOKIE,
  USER_COOKIE,
  USER_SESSION_MAX_AGE,
  USER_SESSION_REFRESH_AFTER,
} from "@/constants/session";
import {
  getSessionCookieOptions,
  signSession,
  verifySession,
} from "@/services/session-token";

const redirectTo = (path: string, request: NextRequest) =>
  NextResponse.redirect(new URL(path, request.url));

const readSession = (request: NextRequest, cookieName: string) =>
  verifySession(request.cookies.get(cookieName)?.value);

// Slides the user session forward (at most once a day) so it only ends on an
// explicit logout, not because the user didn't open the app for a while.
const withRefreshedUserSession = async (
  response: NextResponse,
  userId: number,
  issuedAt: number,
) => {
  if (Date.now() / 1000 - issuedAt > USER_SESSION_REFRESH_AFTER) {
    const token = await signSession(
      { role: "user", userId },
      USER_SESSION_MAX_AGE,
    );

    response.cookies.set(
      USER_COOKIE,
      token,
      getSessionCookieOptions(USER_SESSION_MAX_AGE),
    );
  }
  return response;
};

// Admin area: /admin/*. Only admins get in; a signed-in user is sent back to
// their own app and never sees the admin login.
const handleAdminArea = async (request: NextRequest) => {
  const isLoginPage = request.nextUrl.pathname === ROUTES.ADMIN_LOGIN;
  const adminSession = await readSession(request, ADMIN_COOKIE);

  if (adminSession?.role === "admin") {
    return isLoginPage
      ? redirectTo(ROUTES.ADMIN, request)
      : NextResponse.next();
  }

  const userSession = await readSession(request, USER_COOKIE);

  if (userSession?.role === "user") {
    return redirectTo(ROUTES.WORKOUTS, request);
  }
  return isLoginPage
    ? NextResponse.next()
    : redirectTo(ROUTES.ADMIN_LOGIN, request);
};

// User area: / (login), /workouts/*, /nutrition/* and /summary/*.
const handleUserArea = async (request: NextRequest) => {
  const isLoginPage = request.nextUrl.pathname === ROUTES.HOME;
  const userSession = await readSession(request, USER_COOKIE);

  if (userSession?.role === "user") {
    const response = isLoginPage
      ? redirectTo(ROUTES.WORKOUTS, request)
      : NextResponse.next();

    return withRefreshedUserSession(
      response,
      userSession.userId,
      userSession.issuedAt,
    );
  }

  const adminSession = await readSession(request, ADMIN_COOKIE);

  if (adminSession?.role === "admin") {
    return redirectTo(ROUTES.ADMIN, request);
  }
  return isLoginPage ? NextResponse.next() : redirectTo(ROUTES.HOME, request);
};

// Optimistic cookie checks only; pages, guard layouts and server actions
// re-verify against the database through services/auth-guard.
export const proxy = (request: NextRequest) =>
  request.nextUrl.pathname.startsWith(ROUTES.ADMIN)
    ? handleAdminArea(request)
    : handleUserArea(request);

export const config = {
  matcher: [
    "/",
    "/workouts/:path*",
    "/nutrition/:path*",
    "/summary/:path*",
    "/admin/:path*",
  ],
};
