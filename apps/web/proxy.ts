import { type NextRequest, NextResponse } from "next/server";

import { ROUTES } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import { sessionCookieFor } from "@/services/session-cookie";

const redirectTo = (path: string, request: NextRequest) =>
  NextResponse.redirect(new URL(path, request.url));

// Only the cookie's presence is checked here: the token is opaque and only the
// API can say whether it is still valid. Pages, guard layouts and server
// actions ask the API (GET /v1/auth/me through services/auth-guard); a stale
// cookie is cleared by /session/end.
const hasCookie = (request: NextRequest, cookieName: string) =>
  Boolean(request.cookies.get(cookieName)?.value);

// A page navigation (not a server action, not a prefetch): the only requests
// that extend the trainee cookie, so it never races with a login or logout
// action that writes the same cookie.
const isNavigation = (request: NextRequest) =>
  request.method === "GET" && !request.headers.has("next-router-prefetch");

// The API slides a trainee session on use; this slides the cookie with it, so
// a trainee who keeps opening the app is never asked to log in again (the
// browser caps a cookie at 400 days from the last time it was set).
const withSlidingUserCookie = (
  response: NextResponse,
  request: NextRequest,
) => {
  const token = request.cookies.get(USER_COOKIE)?.value;

  if (token && isNavigation(request)) {
    const { name, value, options } = sessionCookieFor("user", token);

    response.cookies.set(name, value, options);
  }
  return response;
};

// Admin area: /admin/*. Only admins get in; a signed-in user is sent back to
// their own app and never sees the admin login.
const handleAdminArea = (request: NextRequest) => {
  const isLoginPage = request.nextUrl.pathname === ROUTES.ADMIN_LOGIN;

  if (hasCookie(request, ADMIN_COOKIE)) {
    return isLoginPage
      ? redirectTo(ROUTES.ADMIN, request)
      : NextResponse.next();
  }
  if (hasCookie(request, USER_COOKIE)) {
    return redirectTo(ROUTES.WORKOUTS, request);
  }
  return isLoginPage
    ? NextResponse.next()
    : redirectTo(ROUTES.ADMIN_LOGIN, request);
};

// User area: / (login), /feed/*, /friends/*, /terms/*, /profile/*, /post/*, /notifications/*, /workouts/*, /nutrition/*, /summary/*, /messages/*, /foods/* and /account/*.
const handleUserArea = (request: NextRequest) => {
  const isLoginPage = request.nextUrl.pathname === ROUTES.HOME;

  if (hasCookie(request, USER_COOKIE)) {
    return withSlidingUserCookie(
      isLoginPage ? redirectTo(ROUTES.WORKOUTS, request) : NextResponse.next(),
      request,
    );
  }
  if (hasCookie(request, ADMIN_COOKIE)) {
    return redirectTo(ROUTES.ADMIN, request);
  }
  return isLoginPage ? NextResponse.next() : redirectTo(ROUTES.HOME, request);
};

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
    "/messages/:path*",
    "/foods/:path*",
    "/feed/:path*",
    "/friends/:path*",
    "/terms/:path*",
    "/profile/:path*",
    "/post/:path*",
    "/notifications/:path*",
    "/account/:path*",
    "/admin/:path*",
  ],
};
