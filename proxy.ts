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

// Slides the user session forward (at most once a day) so it only ends on an
// explicit logout, not because the user didn't open the app for a while.
const refreshUserSession = async (response: NextResponse, userId: number) => {
  const token = await signSession(
    { role: "user", userId },
    USER_SESSION_MAX_AGE,
  );

  response.cookies.set(
    USER_COOKIE,
    token,
    getSessionCookieOptions(USER_SESSION_MAX_AGE),
  );
};

// Optimistic cookie check only; pages and server actions re-verify (and hit
// the database) through services/auth-guard.
export const proxy = async (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(ROUTES.ADMIN) && pathname !== ROUTES.ADMIN_LOGIN) {
    const session = await verifySession(
      request.cookies.get(ADMIN_COOKIE)?.value,
    );

    if (session?.role !== "admin") {
      return redirectTo(ROUTES.ADMIN_LOGIN, request);
    }
  }

  if (pathname.startsWith(ROUTES.WORKOUTS)) {
    const session = await verifySession(
      request.cookies.get(USER_COOKIE)?.value,
    );

    if (session?.role !== "user") {
      return redirectTo(ROUTES.HOME, request);
    }

    const response = NextResponse.next();
    const sessionAge = Date.now() / 1000 - session.issuedAt;

    if (sessionAge > USER_SESSION_REFRESH_AFTER) {
      await refreshUserSession(response, session.userId);
    }
    return response;
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/admin/:path*", "/workouts/:path*"],
};
