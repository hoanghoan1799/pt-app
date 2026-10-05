import { type NextRequest, NextResponse } from "next/server";

import { ROUTES } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import { verifySession } from "@/services/session-token";

// Optimistic cookie check only; pages and server actions re-verify (and hit
// the database) through services/auth-guard.
export const proxy = async (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(ROUTES.ADMIN) && pathname !== ROUTES.ADMIN_LOGIN) {
    const session = await verifySession(
      request.cookies.get(ADMIN_COOKIE)?.value,
    );

    if (session?.role !== "admin") {
      return NextResponse.redirect(new URL(ROUTES.ADMIN_LOGIN, request.url));
    }
  }

  if (pathname.startsWith(ROUTES.WORKOUTS)) {
    const session = await verifySession(
      request.cookies.get(USER_COOKIE)?.value,
    );

    if (session?.role !== "user") {
      return NextResponse.redirect(new URL(ROUTES.HOME, request.url));
    }
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/admin/:path*", "/workouts/:path*"],
};
